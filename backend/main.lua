local logger     = require("logger")
local millennium = require("millennium")
local json       = require("json")
local ok_fs, fs = pcall(require, "fs"); if not ok_fs then fs = nil end
local ok_utils, utils = pcall(require, "utils"); if not ok_utils then utils = nil end
local ok_http, http = pcall(require, "http"); if not ok_http then http = nil end

local function resolve_plugin_dir()
    local source = debug.getinfo(1, "S").source or ""
    if source:sub(1, 1) == "@" then source = source:sub(2) end
    local dir = source:match("^(.+)[/\\]backend[/\\][^/\\]+$")
    if dir then return dir end
    return millennium.steam_path() .. "/millennium/plugins/Game Theme Song"
end

local SEP = package.config:sub(1, 1)

local function norm_path(p)
    p = tostring(p)
    if SEP == "\\" then
        p = p:gsub("/", "\\")
        return (p:gsub("\\+$", ""))
    end
    p = p:gsub("\\", "/")
    return (p:gsub("(.)/+$", "%1"))
end

local function join(...)
    return table.concat({ ... }, SEP)
end

local PLUGIN_DIR = norm_path(resolve_plugin_dir())
local CACHE_FILE = join(PLUGIN_DIR, "cache.json")
local CONFIG_FILE = join(PLUGIN_DIR, "settings.json")
local CUSTOM_FILE = join(PLUGIN_DIR, "custom.json")
local RESOLVE_MARKER = join(PLUGIN_DIR, "resolve.lock")
local BOOT_MARKER = join(PLUGIN_DIR, "boot.lock")
local AUDIO_DIR = join(norm_path(millennium.steam_path()), "steamui", "game_theme_song")
local LOOPBACK_BASE = "https://steamloopback.host/game_theme_song/"
local CONFIG_VERSION = 13

local DEFAULT_SETTINGS = {
    config_version = CONFIG_VERSION,
    enabled = true,
    volume = 0.35,
    fade_seconds = 1.5,
    search_suffix = " theme song",
    loop = true,
    max_seconds = 0,
    stop_on_launch = true,
    manual_search = true,
    confirm_before_download = false,
}

local cache = {}
local settings = {}
local custom = {}

local MAX_JSON_BYTES = 1 * 1024 * 1024
local MAX_JSON_DEPTH = 32
local MAX_HTTP_BYTES = 3 * 1024 * 1024
local MAX_TITLE_LEN = 200
local MAX_LIST_ITEMS = 500

local function to_valid_utf8(s)
    if type(s) ~= "string" then return s end
    local out, i, n = {}, 1, #s
    local repl = "\239\191\189"
    while i <= n do
        local c = s:byte(i)
        if c < 0x80 then
            out[#out + 1] = string.char(c); i = i + 1
        elseif c >= 0xC2 and c <= 0xDF and i + 1 <= n
                and s:byte(i + 1) >= 0x80 and s:byte(i + 1) <= 0xBF then
            out[#out + 1] = s:sub(i, i + 1); i = i + 2
        elseif c >= 0xE0 and c <= 0xEF and i + 2 <= n then
            local c2, c3 = s:byte(i + 1), s:byte(i + 2)
            local ok = c2 >= 0x80 and c2 <= 0xBF and c3 >= 0x80 and c3 <= 0xBF
                and not (c == 0xE0 and c2 < 0xA0)
                and not (c == 0xED and c2 >= 0xA0)
            if ok then out[#out + 1] = s:sub(i, i + 2); i = i + 3
            else out[#out + 1] = repl; i = i + 1 end
        elseif c >= 0xF0 and c <= 0xF4 and i + 3 <= n then
            local c2, c3, c4 = s:byte(i + 1), s:byte(i + 2), s:byte(i + 3)
            local ok = c2 >= 0x80 and c2 <= 0xBF and c3 >= 0x80 and c3 <= 0xBF
                and c4 >= 0x80 and c4 <= 0xBF
                and not (c == 0xF0 and c2 < 0x90)
                and not (c == 0xF4 and c2 > 0x8F)
            if ok then out[#out + 1] = s:sub(i, i + 3); i = i + 4
            else out[#out + 1] = repl; i = i + 1 end
        else
            out[#out + 1] = repl; i = i + 1
        end
    end
    return table.concat(out)
end

local function sanitize_text(s, max_len)
    s = to_valid_utf8(tostring(s or "")):gsub("[%z\1-\8\11\12\14-\31\127]", "")
    max_len = max_len or MAX_TITLE_LEN
    if #s > max_len then s = s:sub(1, max_len) end
    return s
end

local function cap_body(body)
    if type(body) == "string" and #body > MAX_HTTP_BYTES then
        return body:sub(1, MAX_HTTP_BYTES)
    end
    return body
end

local function json_safe_to_decode(str, max_depth)
    if type(str) ~= "string" then return false end
    local n = #str
    if n == 0 or n > MAX_JSON_BYTES then return false end
    local i = 1
    while i <= n do
        local c = str:byte(i)
        if c == 32 or c == 9 or c == 10 or c == 13 then i = i + 1 else break end
    end
    if i > n then return false end
    local first = str:byte(i)
    if first ~= 123 and first ~= 91 then return false end
    local depth, in_str = 0, false
    while i <= n do
        local c = str:byte(i)
        if in_str then
            if c == 92 then i = i + 1
            elseif c == 34 then in_str = false end
        elseif c == 34 then in_str = true
        elseif c == 123 or c == 91 then
            depth = depth + 1
            if depth > max_depth then return false end
        elseif c == 125 or c == 93 then
            depth = depth - 1
            if depth < 0 then return false end
        end
        i = i + 1
    end
    if in_str or depth ~= 0 then return false end
    return true
end

local function presanitize_json(str)
    str = to_valid_utf8(str)
    str = str:gsub("\\[uU][dD][89aAbBcCdDeEfF]%x%x", "\\uFFFD")
    return str
end

local function safe_decode(str)
    if not str or str == "" then return nil end
    str = presanitize_json(str)
    if not json_safe_to_decode(str, MAX_JSON_DEPTH) then
        return nil
    end
    local ok, val = pcall(json.decode, str)
    if not ok then
        return nil
    end
    return val
end

local function safe_encode(val)
    local ok, res = pcall(json.encode, val)
    if not ok then
        return nil
    end
    return res
end

local gts_unpack = table.unpack or unpack

local function deep_safe(v, depth)
    local t = type(v)
    if t == "string" then
        return (to_valid_utf8(v):gsub("%z", ""))
    elseif t == "number" then
        if v ~= v or v == math.huge or v == -math.huge then return 0 end
        return v
    elseif t == "boolean" then
        return v
    elseif t == "table" then
        if depth >= MAX_JSON_DEPTH then return nil end
        local out = {}
        for k, val in pairs(v) do
            local kt = type(k)
            local nk = nil
            if kt == "string" then nk = (to_valid_utf8(k):gsub("%z", ""))
            elseif kt == "number" then if k == k and k ~= math.huge and k ~= -math.huge then nk = k end end
            if nk ~= nil then
                local nv = deep_safe(val, depth + 1)
                if nv ~= nil then out[nk] = nv end
            end
        end
        return out
    end
    return nil
end

local function native_string(s, max)
    s = to_valid_utf8(tostring(s)):gsub("%z", "")
    if max and #s > max then s = s:sub(1, max) end
    return s
end

local function native_url(u)
    u = to_valid_utf8(tostring(u)):gsub("[%z\1-\31\127]", "")
    if #u > 4096 then u = u:sub(1, 4096) end
    return u
end

do
    local _encode = json.encode
    json.encode = function(v) return _encode(deep_safe(v, 0)) end
    local _decode = json.decode
    json.decode = function(s)
        if type(s) == "string" then s = presanitize_json(s) end
        return _decode(s)
    end
end

if http then
    if type(http.request) == "function" then
        local _r = http.request
        http.request = function(url, opts) return _r(native_url(url), opts) end
    end
    if type(http.download) == "function" then
        local _d = http.download
        http.download = function(url, path, opts) return _d(native_url(url), native_string(path), opts) end
    end
end

if fs then
    local function wrap_path1(name)
        if type(fs[name]) == "function" then
            local orig = fs[name]
            fs[name] = function(p, ...) return orig(native_string(p), ...) end
        end
    end
    wrap_path1("list"); wrap_path1("exists"); wrap_path1("remove"); wrap_path1("create_directories")
    if type(fs.copy) == "function" then
        local _c = fs.copy
        fs.copy = function(a, b, ...) return _c(native_string(a), native_string(b), ...) end
    end
end

if type(logger) == "table" then
    for _, m in ipairs({ "info", "warn", "error", "debug", "trace", "log" }) do
        if type(logger[m]) == "function" then
            local orig = logger[m]
            logger[m] = function(...)
                local n = select("#", ...)
                local args = { ... }
                for i = 1, n do
                    if type(args[i]) == "string" then args[i] = native_string(args[i], 4000) end
                end
                return orig(gts_unpack(args, 1, n))
            end
        end
    end
end

if utils and type(utils.url_encode) == "function" then
    local _u = utils.url_encode
    utils.url_encode = function(t) return _u(native_string(t)) end
end

local function read_file(path)
    local f = io.open(path, "rb")
    if not f then return nil end
    local data = f:read("*a")
    f:close()
    return data
end

local function write_file(path, data)
    local f = io.open(path, "wb")
    if not f then return false end
    f:write(data)
    f:close()
    return true
end

local function write_file_atomic(path, data)
    local tmp = path .. ".tmp"
    if not write_file(tmp, data) then return false end
    pcall(os.remove, path)
    if not os.rename(tmp, path) then
        pcall(os.remove, tmp)
        return write_file(path, data)
    end
    return true
end

local function merge_defaults(target, defaults)
    for k, v in pairs(defaults) do
        if target[k] == nil then target[k] = v end
    end
    return target
end

local function scrub_state(tbl)
    if type(tbl) ~= "table" then return {} end
    return deep_safe(tbl, 0) or {}
end

local function load_state()
    local ok_c = pcall(function()
        cache = scrub_state(safe_decode(read_file(CACHE_FILE)) or {})
    end)
    if not ok_c or type(cache) ~= "table" then cache = {}; pcall(os.remove, CACHE_FILE) end

    local ok_u = pcall(function()
        custom = scrub_state(safe_decode(read_file(CUSTOM_FILE)) or {})
    end)
    if not ok_u or type(custom) ~= "table" then custom = {}; pcall(os.remove, CUSTOM_FILE) end

    local ok_s = pcall(function()
        local loaded = safe_decode(read_file(CONFIG_FILE)) or {}
        if type(loaded) ~= "table" then loaded = {} end
        if (loaded.config_version or 0) < CONFIG_VERSION then loaded.config_version = CONFIG_VERSION end
        settings = merge_defaults(loaded, DEFAULT_SETTINGS)
    end)
    if not ok_s or type(settings) ~= "table" then
        settings = merge_defaults({}, DEFAULT_SETTINGS)
        pcall(os.remove, CONFIG_FILE)
    end
end

local function save_cache()
    local s = safe_encode(cache); if s then write_file_atomic(CACHE_FILE, s) end
end

local function save_settings()
    local s = safe_encode(settings); if s then write_file_atomic(CONFIG_FILE, s) end
end

local function save_custom()
    local s = safe_encode(custom); if s then write_file_atomic(CUSTOM_FILE, s) end
end

local function cleanup_legacy_worker()
    for _, path in ipairs({
        join(PLUGIN_DIR, "yt-dlp.exe"),
        join(PLUGIN_DIR, "yt-dlp.exe.part"),
        join(PLUGIN_DIR, "queue", "worker.alive"),
        join(PLUGIN_DIR, "queue", "ytdlp-download.done"),
        join(PLUGIN_DIR, "queue", "ytdlp-install.ps1"),
        join(PLUGIN_DIR, "queue", "worker.expected_version"),
    }) do
        pcall(os.remove, path)
    end
end

local b64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

local function base64_encode(input)
    input = tostring(input or "")
    local out = {}
    local out_i = 1
    for i = 1, #input, 3 do
        local b1 = input:byte(i) or 0
        local b2 = input:byte(i + 1)
        local b3 = input:byte(i + 2)
        local n = b1 * 65536 + (b2 or 0) * 256 + (b3 or 0)
        out[out_i] = b64chars:sub(math.floor(n / 262144) % 64 + 1, math.floor(n / 262144) % 64 + 1)
        out_i = out_i + 1
        out[out_i] = b64chars:sub(math.floor(n / 4096) % 64 + 1, math.floor(n / 4096) % 64 + 1)
        out_i = out_i + 1
        if b2 then
            out[out_i] = b64chars:sub(math.floor(n / 64) % 64 + 1, math.floor(n / 64) % 64 + 1)
        else
            out[out_i] = "="
        end
        out_i = out_i + 1
        if b3 then
            out[out_i] = b64chars:sub(n % 64 + 1, n % 64 + 1)
        else
            out[out_i] = "="
        end
        out_i = out_i + 1
    end
    return table.concat(out)
end

local b64lookup = {}
for i = 1, #b64chars do b64lookup[b64chars:sub(i, i)] = i - 1 end

local function base64_decode(data)
    data = tostring(data or "")
    local prefix = data:match("^data:[^,]*,")
    if prefix then data = data:sub(#prefix + 1) end
    local parts, out, n = {}, {}, 0
    local acc, accbits = 0, 0
    for i = 1, #data do
        local v = b64lookup[data:sub(i, i)]
        if v then
            acc = acc * 64 + v
            accbits = accbits + 6
            if accbits >= 8 then
                accbits = accbits - 8
                n = n + 1
                out[n] = string.char(math.floor(acc / (2 ^ accbits)) % 256)
                acc = acc % (2 ^ accbits)
                if n >= 8192 then
                    parts[#parts + 1] = table.concat(out, "", 1, n)
                    out, n = {}, 0
                end
            end
        end
    end
    if n > 0 then parts[#parts + 1] = table.concat(out, "", 1, n) end
    return table.concat(parts)
end

local function url_encode(text)
    if utils and utils.url_encode then return utils.url_encode(text) end
    return tostring(text):gsub("[^%w%-_%.~]", function(c)
        return string.format("%%%02X", string.byte(c))
    end)
end

local function http_available()
    return http ~= nil and http.request ~= nil
end

local function norm_words(text)
    local t = tostring(text):lower():gsub("[^%w]+", " "):gsub("^%s+", ""):gsub("%s+$", "")
    return " " .. t .. " "
end

local EDITION_PHRASES = {
    "game of the year edition", "game of the year", "goty edition", "goty",
    "digital deluxe edition", "deluxe edition", "premium edition", "definitive edition",
    "complete edition", "enhanced edition", "special edition", "ultimate edition",
    "anniversary edition", "legendary edition", "collector's edition", "collectors edition",
    "gold edition", "standard edition", "vr edition", "director's cut", "directors cut",
    "hd remaster", "remastered", "remaster", "redux",
}

local function clean_game_name(name)
    local s = tostring(name):gsub("\226\132\162", ""):gsub("\194\174", ""):gsub("\194\169", ""):gsub("\226\128\153", "'"):lower()
    for _, p in ipairs(EDITION_PHRASES) do
        s = s:gsub("%f[%w]" .. p .. "%f[%W]", " ")
    end
    s = s:gsub("[%s:%-]+$", "")
    s = s:gsub("%s+", " "):gsub("^%s+", "")
    return s
end

local function name_variants(game_name)
    local variants, seen = {}, {}
    local function add(v)
        if v and #v > 2 and not seen[v] then seen[v] = true; variants[#variants + 1] = v end
    end
    local cleaned = clean_game_name(game_name)
    add(cleaned)
    add(cleaned:match("^(.-)%s*:") or cleaned:match("^(.-)%s+%-%s"))
    add((tostring(game_name):gsub("\226\132\162", ""):gsub("\194\174", ""):gsub("\194\169", "")))
    return variants
end

local GOOD_WORDS = {
    { "main theme", 45 },
    { "main menu", 40 },
    { "menu theme", 40 },
    { "title screen", 30 },
    { "theme", 30 },
    { "soundtrack", 25 },
    { "ost", 25 },
    { "menu", 15 },
    { "music", 10 },
}

local BAD_WORDS = {
    "remix", "cover", "slowed", "reverb", "nightcore", "8d", "bass boosted",
    "1 hour", "10 hours", "live", "reaction", "piano", "guitar", "violin",
    "metal version", "lofi", "lo fi", "shorts", "tutorial", "how to", "ranking",
}

local function score_candidate(c, game_name)
    local title = norm_words(c.title or "")
    local score = 0
    local words, hits = 0, 0
    for w in norm_words(game_name):gmatch("%S+") do
        words = words + 1
        if title:find(" " .. w .. " ", 1, true) then hits = hits + 1 end
    end
    if words > 0 then
        score = score + math.floor(60 * hits / words)
        if hits == words then score = score + 40 end
    end
    local game_nums = {}
    for w in norm_words(game_name):gmatch("%S+") do
        if w:match("^%d+$") then game_nums[w] = true end
    end
    for num in title:gmatch("%s(%d+)%f[%s]") do
        local n = tonumber(num)
        if n and n <= 50 and not game_nums[num] then score = score - 25 end
    end
    for _, g in ipairs(GOOD_WORDS) do
        if title:find(" " .. g[1] .. " ", 1, true) then
            score = score + g[2]
            break
        end
    end
    for _, b in ipairs(BAD_WORDS) do
        if title:find(" " .. b .. " ", 1, true) then score = score - 100 end
    end
    local sec = c.seconds
    if not sec then score = score - 10
    elseif sec < 60 then score = score - 80
    elseif sec <= 600 then score = score + 25
    elseif sec <= 1200 then score = score + 5
    else score = score - 40 end
    return score
end

local function order_candidates(candidates, game_name)
    for _, c in ipairs(candidates) do c.score = score_candidate(c, game_name) end
    table.sort(candidates, function(a, b) return (a.score or 0) > (b.score or 0) end)
    return candidates
end

local function build_exclude(exclude)
    local set = {}
    if type(exclude) == "string" and exclude ~= "" then exclude = safe_decode(exclude) end
    if type(exclude) == "table" then
        for _, title in ipairs(exclude) do
            if type(title) == "string" and title ~= "" then
                set[norm_words(title)] = true
            end
        end
    end
    return set
end

local function is_excluded(exclude_set, title)
    if not exclude_set then return false end
    return exclude_set[norm_words(title or "")] == true
end

local AUDIO_EXTS = { "webm", "m4a", "mp3", "ogg", "wav", "flac" }

local function looks_like_audio(path)
    local f = io.open(path, "rb")
    if not f then return false, "unreadable" end
    local head = f:read(16) or ""
    f:close()
    if #head < 4 then return false, "too_short" end
    local sig3, sig4 = head:sub(1, 3), head:sub(1, 4)
if sig3 == "ID3" or sig4 == "OggS" or sig4 == "fLaC" or sig4 == "RIFF" then return true end
if #head >= 8 and head:sub(5, 8) == "ftyp" then return true end
if sig4 == "\26\69\223\163" then return true end
    local b1, b2 = head:byte(1, 2)
    if b1 == 255 and b2 and b2 >= 224 then return true end
    return false, head:gsub("%c", "."):sub(1, 16)
end

local function download_file(key, ext, url, ua)
    if not fs or not http or not http.download then return nil, "download_unsupported" end
    pcall(fs.create_directories, AUDIO_DIR)
    local filename = key .. "." .. ext
    local path = join(AUDIO_DIR, filename)
    for _, e in ipairs(AUDIO_EXTS) do
        if e ~= ext then pcall(fs.remove, join(AUDIO_DIR, key .. "." .. e)) end
    end
    local result, err = http.download(url, path, { timeout = 180, user_agent = ua })
    if not result or not result.success or result.status ~= 200 or (result.bytes_written or 0) <= 0 then
        pcall(fs.remove, path)
        local detail = err or (result and ("status_" .. tostring(result.status))) or "unknown"
        return nil, "download_failed: " .. tostring(detail)
    end
    if (result.bytes_written or 0) < 16384 then
        pcall(fs.remove, path)
        return nil, "download_too_small"
    end
    local valid, head = looks_like_audio(path)
    if not valid then
        pcall(fs.remove, path)
        logger:warn("downloaded file is not audio (head=" .. tostring(head) .. ", bytes=" .. tostring(result.bytes_written) .. ") url=" .. tostring(url))
        return nil, "not_audio"
    end
    return filename, nil
end

local LOCAL_EXTS = { mp3 = true, ogg = true, m4a = true, flac = true, wav = true }
local LOCAL_DIR_HINTS = { "music", "bgm", "soundtrack", "ost", "audio" }
local LOCAL_NAME_SCORES = {
    { "main theme", 60 }, { "maintheme", 60 }, { "main menu", 50 }, { "mainmenu", 50 },
    { "title screen", 48 }, { "titlescreen", 48 }, { "theme", 45 }, { "title", 40 },
    { "menu", 32 }, { "opening", 20 }, { "intro", 18 }, { "main", 16 },
}
local LOCAL_BAD_WORDS = { "sfx", "effect", "voice", "ambient", "ambience", "footstep", "trailer", "credits", "jingle", "stinger" }

local function vdf_unescape(v)
    return (tostring(v):gsub("\\\\", "\\"))
end

local _libs_cache, _libs_cache_ts = nil, 0
local function steam_libraries()
    local now = os.time()
    if _libs_cache and (now - _libs_cache_ts) < 60 then return _libs_cache end
    local libs, seen = {}, {}
    local function add(p)
        p = norm_path(p)
        local lower = p:lower()
        if #p > 2 and not seen[lower] and fs.exists(join(p, "steamapps")) then
            seen[lower] = true
            libs[#libs + 1] = p
        end
    end
    local root = norm_path(millennium.steam_path())
    add(root)
    local body = read_file(join(root, "steamapps", "libraryfolders.vdf"))
    if body then
        for p in body:gmatch('"path"%s*"([^"]*)"') do add(vdf_unescape(p)) end
    end
    _libs_cache, _libs_cache_ts = libs, now
    return libs
end

local function find_install_dir(key)
    for _, lib in ipairs(steam_libraries()) do
        local manifest = read_file(join(lib, "steamapps", "appmanifest_" .. key .. ".acf"))
        if manifest then
            local dir = manifest:match('"installdir"%s*"([^"]*)"')
            if dir and dir ~= "" then
                local full = join(lib, "steamapps", "common", vdf_unescape(dir))
                if fs.exists(full) then return full end
            end
        end
    end
    return nil
end

local function collect_audio_files(root, max_depth, max_entries)
    local results = {}
    local queue = { { path = root, depth = 0 } }
    local scanned = 0
    while #queue > 0 do
        local item = table.remove(queue, 1)
        local entries = fs.list(item.path)
        if type(entries) == "table" then
            for _, e in ipairs(entries) do
                scanned = scanned + 1
                if scanned > max_entries then return results end
                if e.is_directory then
                    if item.depth < max_depth then queue[#queue + 1] = { path = e.path, depth = item.depth + 1 } end
                elseif e.is_file then
                    local ext = tostring(e.name):match("%.(%w+)$")
                    ext = ext and ext:lower()
                    if ext and LOCAL_EXTS[ext] then
                        local size = tonumber(e.size) or 0
                        if size >= 300 * 1024 and size <= 60 * 1024 * 1024 then
                            results[#results + 1] = { path = tostring(e.path), name = tostring(e.name), rel = tostring(e.path):sub(#root + 2) }
                        end
                    end
                end
            end
        end
    end
    return results
end

local function score_local_file(rel)
    local words = " " .. rel:lower():gsub("[^%w]+", " ") .. " "
    local score = 0
    for _, entry in ipairs(LOCAL_NAME_SCORES) do
        if words:find(" " .. entry[1] .. " ", 1, true) then score = score + entry[2]; break end
    end
    for _, b in ipairs(LOCAL_BAD_WORDS) do
        if words:find(" " .. b .. " ", 1, true) then score = score - 60 end
    end
    for _, h in ipairs(LOCAL_DIR_HINTS) do
        if words:find(" " .. h .. " ", 1, true) then score = score + 8; break end
    end
    return score
end

local mem_cache = { soundtrack = {}, khinsider = {}, track_mp3 = {} }

local function pick_soundtrack_track(game_name)
    local target = norm_words(clean_game_name(game_name)):gsub("^%s+", ""):gsub("%s+$", "")
    if #target < 3 then return nil end
    local now = os.time()
    local cached = mem_cache.soundtrack[target]
    if cached and (now - cached.ts) < 90 then
        if cached.value == false then return nil end
        return cached.value
    end
    local found = nil
    for _, lib in ipairs(steam_libraries()) do
        local entries = fs.list(join(lib, "steamapps", "music"))
        if type(entries) == "table" then
            for _, e in ipairs(entries) do
                if e.is_directory and norm_words(tostring(e.name)):find(target, 1, true) then
                    local files = collect_audio_files(tostring(e.path), 3, 2000)
                    local best, best_score
                    for _, f in ipairs(files) do
                        local sc = score_local_file(f.rel)
                        if f.name:match("^%D*0?1[%.%s%-_]") then sc = sc + 12 end
                        if not best or sc > best_score or (sc == best_score and f.name < best.name) then best, best_score = f, sc end
                    end
                    if best then found = best; break end
                end
            end
        end
        if found then break end
    end
    mem_cache.soundtrack[target] = { value = found or false, ts = now }
    return found
end

local function pick_install_track(dir)
    local files = collect_audio_files(dir, 4, 6000)
    local best, best_score
    for _, f in ipairs(files) do
        local sc = score_local_file(f.rel)
        if sc >= 16 and (not best or sc > best_score or (sc == best_score and f.path < best.path)) then
            best, best_score = f, sc
        end
    end
    return best
end

local function local_resolve(game_name, key, exclude_set, dl_base)
    if not (fs and fs.list and fs.copy and fs.exists) then return nil, "local_unsupported" end
    dl_base = dl_base or key
    local picked = pick_soundtrack_track(game_name)
    if not picked then
        local dir = find_install_dir(key)
        if dir then picked = pick_install_track(dir) end
    end
    if not picked then return nil, "no_local_audio" end
    local picked_title = (tostring(picked.name):gsub("%.%w+$", ""))
    if is_excluded(exclude_set, picked_title) then return nil, "local_excluded" end
    local ext = tostring(picked.name):match("%.(%w+)$")
    if not ext then return nil, "no_local_audio" end
    ext = ext:lower()
    pcall(fs.create_directories, AUDIO_DIR)
    for _, e in ipairs(AUDIO_EXTS) do
        if e ~= ext then pcall(fs.remove, join(AUDIO_DIR, dl_base .. "." .. e)) end
    end
    local copied = fs.copy(picked.path, join(AUDIO_DIR, dl_base .. "." .. ext))
    if not copied then return nil, "local_copy_failed" end
    return { file = dl_base .. "." .. ext, title = (tostring(picked.name):gsub("%.%w+$", "")) }
end

local KHINSIDER_BASE = "https://downloads.khinsider.com"
local BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

local function khinsider_get(url)
    local resp, err = http.request(url, { method = "GET", timeout = 20, user_agent = BROWSER_UA })
    if resp and resp.status == 200 and resp.body then return cap_body(resp.body), nil end
    return nil, tostring(err or (resp and resp.status) or "no_response")
end

local function khinsider_pick_album(body, game_name)
    local albums, seen = {}, {}
    for href, title in body:gmatch('<a href="(/game%-soundtracks/album/[^"]+)">([^<]+)</a>') do
        if not seen[href] then
            seen[href] = true
            albums[#albums + 1] = { href = href, title = title }
        end
    end
    if #albums == 0 then return nil end
    local target = norm_words(game_name)
    local best, best_score = nil, 0
    for i, a in ipairs(albums) do
        local t = norm_words(a.title)
        local score = 0
        if t == target then score = 1000
        elseif t:find(target, 1, true) then score = 500 end
        if score > 0 then
            local lt = a.title:lower()
            if lt:find("sound effects", 1, true) or lt:find("concert", 1, true) or lt:find("remix", 1, true) then
                score = score - 400
            end
            score = score - i
        end
        if score > best_score then best, best_score = a, score end
    end
    return best
end

local function khinsider_pick_tracks(body)
    local tracks, seen = {}, {}
    for href, name in body:gmatch('<td class="clickable%-row"><a href="(/game%-soundtracks/album/[^"]+%.mp3)">([^<]+)</a>') do
        if not seen[href] then
            seen[href] = true
            local n = " " .. tostring(name):lower() .. " "
            local score = 0
            if n:find("main theme", 1, true) then score = 50
            elseif n:find("theme", 1, true) then score = 40
            elseif n:find("main menu", 1, true) then score = 35
            elseif n:find("title", 1, true) then score = 25
            elseif n:find("menu", 1, true) then score = 20 end
            score = score - #tracks
            tracks[#tracks + 1] = { href = href, name = name, score = score }
        end
    end
    if #tracks == 0 then return nil end
    table.sort(tracks, function(a, b) return (a.score or 0) > (b.score or 0) end)
    return tracks
end

local function khinsider_resolve(game_name, key, exclude_set, dl_base)
    dl_base = dl_base or key
    if not http_available() then return nil, "http_module_missing" end
    local query = tostring(game_name):gsub("\226\132\162", ""):gsub("\194\174", ""):gsub("\194\169", "")
    local now = os.time()
    local album, tracks
    local cached = mem_cache.khinsider[query]
    if cached and (now - cached.ts) < 180 then
        album, tracks = cached.album, cached.tracks
    else
        local body, err = khinsider_get(KHINSIDER_BASE .. "/search?search=" .. url_encode(query))
        if not body then return nil, "khinsider_search_failed: " .. tostring(err) end
        album = khinsider_pick_album(body, query)
        if not album then return nil, "khinsider_no_album" end
        local album_body, aerr = khinsider_get(KHINSIDER_BASE .. album.href)
        if not album_body then return nil, "khinsider_album_failed: " .. tostring(aerr) end
        tracks = khinsider_pick_tracks(album_body)
        if not tracks then return nil, "khinsider_no_tracks" end
        mem_cache.khinsider[query] = { album = album, tracks = tracks, ts = now }
    end
    local last_err = "khinsider_no_tracks"
    for _, track in ipairs(tracks) do
        local title = track.name .. " (" .. album.title .. ")"
        if not is_excluded(exclude_set, title) then
            local mp3 = mem_cache.track_mp3[track.href]
            if not mp3 then
                local track_body, terr = khinsider_get(KHINSIDER_BASE .. track.href)
                if track_body then
                    mp3 = track_body:match('href="(https://[^"]+%.mp3)"')
                    if mp3 then mem_cache.track_mp3[track.href] = mp3 end
                else
                    last_err = "khinsider_track_failed: " .. tostring(terr)
                end
            end
            if mp3 then
                local filename, dl_err = download_file(dl_base, "mp3", mp3, BROWSER_UA)
                if filename then return { file = filename, title = title }, nil end
                last_err = dl_err
            elseif last_err == "khinsider_no_tracks" then
                last_err = "khinsider_no_mp3_link"
            end
        end
    end
    return nil, last_err
end

local SC_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
local sc_client_id = nil

local function sc_fetch_client_id()
    local resp = http.request("https://soundcloud.com/", { user_agent = SC_UA })
    if not resp or resp.status ~= 200 or not resp.body then return nil, "sc_home_failed" end
    local home_body = cap_body(resp.body)
    local assets = {}
    for u in home_body:gmatch('src="(https://a%-v2%.sndcdn%.com/assets/[^"]+%.js)"') do
        assets[#assets + 1] = u
    end
    for i = #assets, 1, -1 do
        local js = http.request(assets[i], { user_agent = SC_UA })
        if js and js.status == 200 and js.body then
            local cid = cap_body(js.body):match('client_id%s*[:=]%s*"(%w+)"')
            if cid and #cid == 32 then return cid, nil end
        end
    end
    return nil, "sc_no_client_id"
end

local function sc_api(path_and_query)
    if not http_available() then return nil, "http_module_missing" end
    if not sc_client_id then
        local cid, err = sc_fetch_client_id()
        if not cid then return nil, err end
        sc_client_id = cid
    end
    local sep = path_and_query:find("?", 1, true) and "&" or "?"
    local url = "https://api-v2.soundcloud.com" .. path_and_query .. sep .. "client_id=" .. sc_client_id
    local resp = http.request(url, { user_agent = SC_UA })
    if resp and (resp.status == 401 or resp.status == 403) then
        local cid = sc_fetch_client_id()
        if cid then
            sc_client_id = cid
            url = "https://api-v2.soundcloud.com" .. path_and_query .. sep .. "client_id=" .. sc_client_id
            resp = http.request(url, { user_agent = SC_UA })
        end
    end
    if not resp or resp.status ~= 200 or not resp.body then
        return nil, "sc_api_failed_" .. tostring(resp and resp.status)
    end
    return safe_decode(cap_body(resp.body)), nil
end

local function sc_resolve(game_name, key, exclude_set, dl_base)
    dl_base = dl_base or key
    local query = game_name .. (settings.search_suffix or "")
    local data, err = sc_api("/search/tracks?q=" .. url_encode(query) .. "&limit=15")
    if not data or type(data.collection) ~= "table" then return nil, err or "sc_search_failed" end
    local candidates = {}
    for _, t in ipairs(data.collection) do
        if type(t) == "table" then
            local prog = nil
            local media = t.media or {}
            for _, tr in ipairs(media.transcodings or {}) do
                local fmt = tr.format or {}
                if fmt.protocol == "progressive" and tr.url then prog = tr.url break end
            end
            if prog then
                candidates[#candidates + 1] = {
                    title = tostring(t.title or ""),
                    seconds = math.floor((tonumber(t.duration) or 0) / 1000),
                    stream_api = prog,
                }
            end
        end
    end
    if #candidates == 0 then return nil, "sc_no_results" end
    order_candidates(candidates, game_name)
    local tried = 0
    for _, c in ipairs(candidates) do
        if tried >= 3 then break end
        if not is_excluded(exclude_set, c.title) then
            tried = tried + 1
            local sep = c.stream_api:find("?", 1, true) and "&" or "?"
            local resp = http.request(c.stream_api .. sep .. "client_id=" .. tostring(sc_client_id), { user_agent = SC_UA })
            local meta = (resp and resp.status == 200 and resp.body) and safe_decode(cap_body(resp.body)) or nil
            if meta and type(meta.url) == "string" then
                local file, dl_err = download_file(dl_base, "mp3", meta.url, SC_UA)
                if file then return { file = file, title = c.title }, nil end
                logger:warn("sc download failed: " .. tostring(dl_err))
            end
        end
    end
    return nil, "sc_download_failed"
end

local resolve_busy = false
local io_busy = false
local custom_list_cache = nil

local function run_io(name, fn)
  if io_busy or resolve_busy then return json.encode({ ok = false, error = "busy" }) end
  io_busy = true
  local ok, res = pcall(fn)
  io_busy = false
  if not ok then
    logger:warn(name .. " failed: " .. tostring(res))
    return json.encode({ ok = false, error = "internal_error" })
  end
  return res
end

local function resolve_theme(app_id, force_refresh, game_name, exclude)
    if resolve_busy then return json.encode({ ok = false, error = "busy" }) end
    resolve_busy = true
    local key = tostring(app_id)
    game_name = native_string(game_name or "", 300)
    local is_reroll = type(exclude) == "string" and exclude ~= ""
    local prev = read_file(RESOLVE_MARKER)
    if prev and prev ~= "" and prev == key and not is_reroll then
        pcall(os.remove, RESOLVE_MARKER)
        cache[key] = nil
        mem_cache.soundtrack = {}
        mem_cache.khinsider = {}
        mem_cache.track_mp3 = {}
        save_cache()
        resolve_busy = false
        return json.encode({ ok = false, error = "skipped_after_crash" })
    end
    write_file(RESOLVE_MARKER, key)
    local ok, result = pcall(function()
        if not game_name or game_name == "" then return json.encode({ ok = false, error = "missing_game_name" }) end
        local key = tostring(app_id)
        local exclude_set = build_exclude(exclude)
        local rerolling = next(exclude_set) ~= nil
        local cust = custom[key]
        if not rerolling and cust and cust.file and fs and fs.exists and fs.exists(join(AUDIO_DIR, cust.file)) then
            local url = LOOPBACK_BASE .. cust.file .. "?v=" .. tostring(cust.ts or 0)
            return json.encode({ ok = true, url = url, title = cust.title, cached = true, custom = true })
        end
        
        local NOT_FOUND_TTL = 6 * 3600
if not force_refresh and not rerolling and entry and entry.not_found then
    if (os.time() - (entry.ts or 0)) < NOT_FOUND_TTL then
        return json.encode({ ok = false, error = "not_found_cached" })
    end
    cache[key] = nil
    entry = nil
end
        if not force_refresh and not rerolling and entry and entry.file and fs and fs.exists and fs.exists(join(AUDIO_DIR, entry.file)) then
            local url = LOOPBACK_BASE .. entry.file .. "?v=" .. tostring(entry.ts or 0)
            return json.encode({ ok = true, url = url, title = entry.title, cached = true })
        end
        local target_slot = "a"
        if rerolling then
            target_slot = (entry and entry.slot == "b") and "a" or "b"
        end
        local dl_base = target_slot == "b" and (key .. "_b") or key
        local variants = name_variants(game_name)
        local r = local_resolve(game_name, key, exclude_set, dl_base)
        local kh_err
        if not (r and r.file) then
            for _, q in ipairs(variants) do
                r, kh_err = khinsider_resolve(q, key, exclude_set, dl_base)
                if r and r.file then break end
            end
        end
        if not (r and r.file) then
            local sc_err
            for _, q in ipairs(variants) do
                r, sc_err = sc_resolve(q, key, exclude_set, dl_base)
                if r and r.file then break end
            end
            if not (r and r.file) then
                logger:warn("no theme audio for " .. tostring(game_name) .. " (khinsider: " .. tostring(kh_err) .. ", soundcloud: " .. tostring(sc_err) .. ")")
local err_code = sc_err or kh_err or "not_found"
if rerolling then err_code = "no_alternative" end
if not rerolling then
    cache[key] = { not_found = true, ts = os.time() }
    save_cache()
end
return json.encode({ ok = false, error = err_code })
            end
        end
        local ts = os.time()
        cache[key] = { file = r.file, title = sanitize_text(r.title), ts = ts, slot = target_slot }
        save_cache()
        local url = LOOPBACK_BASE .. r.file .. "?v=" .. tostring(ts)
        return json.encode({ ok = true, url = url, title = sanitize_text(r.title), cached = false })
    end)
    pcall(os.remove, RESOLVE_MARKER)
    resolve_busy = false
    if not ok then logger:warn("resolve_theme crashed: " .. tostring(result)); return json.encode({ ok = false, error = "internal_error" }) end
    return result
end

function get_theme_audio(app_id, force_refresh, game_name)
    return resolve_theme(app_id, force_refresh, game_name, nil)
end

function reroll_theme(app_id, exclude, force_refresh, game_name)
    return resolve_theme(app_id, force_refresh, game_name, exclude)
end

function invalidate_audio(app_id)
    local key = tostring(app_id)
    if fs and fs.remove then
    for _, e in ipairs(AUDIO_EXTS) do
        pcall(fs.remove, join(AUDIO_DIR, key .. "." .. e))
        pcall(fs.remove, join(AUDIO_DIR, key .. "_b." .. e))
    end
end
    cache[key] = nil
    save_cache()
    return json.encode({ ok = true })
end

local CUSTOM_EXTS = {
    mp3 = "mp3", m4a = "m4a", mp4 = "m4a", aac = "m4a",
    ogg = "ogg", oga = "ogg", opus = "ogg", webm = "webm",
    wav = "wav", flac = "flac",
}

local function custom_ext(filename)
    local ext = tostring(filename or ""):match("%.([%w]+)$")
    if not ext then return nil end
    return CUSTOM_EXTS[ext:lower()]
end

function get_custom_list()
  return run_io("get_custom_list", function()
    if custom_list_cache then return custom_list_cache end
    local items, count = {}, 0
    for key, entry in pairs(custom) do
      if entry and entry.file and fs and fs.exists and fs.exists(join(AUDIO_DIR, entry.file)) then
        items[tostring(key)] = { title = sanitize_text(entry.title or ""), name = sanitize_text(entry.name or "") }
        count = count + 1
        if count >= MAX_LIST_ITEMS then break end
      end
    end
    custom_list_cache = json.encode({ ok = true, items = items })
    return custom_list_cache
  end)
end

local upload_sessions = {}

local function store_custom(app_id, game_name, filename, title, data, ext_hint, title_b64, name_b64)
    if not (fs and fs.create_directories) then return json.encode({ ok = false, error = "fs_unsupported" }) end
    local key = tostring(app_id)
    if key == "" or key == "nil" then return json.encode({ ok = false, error = "missing_app_id" }) end
    local ext
    if ext_hint and tostring(ext_hint) ~= "" then ext = CUSTOM_EXTS[tostring(ext_hint):lower()] end
    if not ext then ext = custom_ext(filename) end
    if not ext then return json.encode({ ok = false, error = "unsupported_format" }) end
    local resolved_title
    if title_b64 and tostring(title_b64) ~= "" then local t = base64_decode(title_b64); if t and t ~= "" then resolved_title = t end end
    local resolved_name
    if name_b64 and tostring(name_b64) ~= "" then local n = base64_decode(name_b64); if n and n ~= "" then resolved_name = n end end
    local bytes = base64_decode(data)
    if #bytes < 1024 then return json.encode({ ok = false, error = "file_too_small" }) end
    if #bytes > 50 * 1024 * 1024 then return json.encode({ ok = false, error = "file_too_large" }) end
    pcall(fs.create_directories, AUDIO_DIR)
    local fname = "custom_" .. key .. "." .. ext
    for e in pairs(CUSTOM_EXTS) do pcall(fs.remove, join(AUDIO_DIR, "custom_" .. key .. "." .. e)) end
    if not write_file(join(AUDIO_DIR, fname), bytes) then return json.encode({ ok = false, error = "write_failed" }) end
    local clean_title = sanitize_text(tostring(resolved_title or ""):gsub("%.[%w]+$", ""))
    if clean_title == "" then clean_title = "Custom track" end
    resolved_name = sanitize_text(resolved_name or "")
    local ts = os.time()
    custom[key] = { file = fname, title = clean_title, name = resolved_name or "", ts = ts }
    custom[key] = { file = fname, title = clean_title, name = resolved_name or "", ts = ts }
    save_custom()
    custom_list_cache = nil
    local url = LOOPBACK_BASE .. fname .. "?v=" .. tostring(ts)
    return json.encode({ ok = true, url = url })
end

function set_custom_music_begin(app_id)
    local key = tostring(app_id)
    if key == "" or key == "nil" then return json.encode({ ok = false, error = "missing_app_id" }) end
    upload_sessions[key] = { parts = {}, bytes = 0 }
    return json.encode({ ok = true })
end

function set_custom_music_chunk(app_id, chunk)
    local key = tostring(app_id)
    local s = upload_sessions[key]
    if not s then return json.encode({ ok = false, error = "no_session" }) end
    local part = tostring(chunk or "")
    s.bytes = s.bytes + #part
    if s.bytes > 80 * 1024 * 1024 then upload_sessions[key] = nil; return json.encode({ ok = false, error = "file_too_large" }) end
    s.parts[#s.parts + 1] = part
    return json.encode({ ok = true })
end

function set_custom_music_finish(app_id, ext, name_b64, title_b64)
    local ok, result = pcall(function()
        local key = tostring(app_id)
        local s = upload_sessions[key]
        if not s then return json.encode({ ok = false, error = "no_session" }) end
        local data = table.concat(s.parts)
        upload_sessions[key] = nil
        return store_custom(app_id, nil, nil, nil, data, ext, title_b64, name_b64)
    end)
    if not ok then logger:warn("set_custom_music_finish crashed: " .. tostring(result)); return json.encode({ ok = false, error = "internal_error" }) end
    return result
end

function clear_custom_music(app_id)
    local ok, result = pcall(function()
        local key = tostring(app_id)
        if fs and fs.remove then
            for e in pairs(CUSTOM_EXTS) do pcall(fs.remove, join(AUDIO_DIR, "custom_" .. key .. "." .. e)) end
        end
        custom[key] = nil
        save_custom()
        custom[key] = nil
    save_custom()
    custom_list_cache = nil
        return json.encode({ ok = true })
    end)
    if not ok then logger:warn("clear_custom_music crashed: " .. tostring(result)); return json.encode({ ok = false, error = "internal_error" }) end
    return result
end

function get_settings()
    local fresh = safe_decode(read_file(CONFIG_FILE))
    if type(fresh) == "table" then settings = merge_defaults(fresh, DEFAULT_SETTINGS) end
    return json.encode(settings)
end

function set_setting(key, value)
    if DEFAULT_SETTINGS[key] == nil then return json.encode({ ok = false, error = "unknown_key" }) end
    settings[key] = value
    if not write_file_atomic(CONFIG_FILE, json.encode(settings)) then return json.encode({ ok = false, error = "write_failed" }) end
    return json.encode({ ok = true })
end

local function file_size(path)
    local f = io.open(path, "rb")
    if not f then return 0 end
    local size = f:seek("end") or 0
    f:close()
    return size
end

local function audio_dir_sizes()
    local sizes = {}
    if fs and fs.list then
        local entries = fs.list(AUDIO_DIR)
        if type(entries) == "table" then
            for _, e in ipairs(entries) do
                if e.is_file then sizes[tostring(e.name)] = tonumber(e.size) or 0 end
            end
        end
    end
    return sizes
end

function get_cache_info()
    return run_io("get_cache_info", function()
        local sizes = audio_dir_sizes()
        local count, bytes = 0, 0
        for _, entry in pairs(cache) do
            if entry and entry.file and sizes[entry.file] then
                count = count + 1
                bytes = bytes + sizes[entry.file]
            end
        end
        return json.encode({ ok = true, count = count, bytes = bytes })
    end)
end

function clear_audio_cache()
    local ok, result = pcall(function()
        local removed = 0
        for key, entry in pairs(cache) do
            if entry and entry.file then
                local path = join(AUDIO_DIR, entry.file)
                if fs and fs.exists and fs.exists(path) and pcall(fs.remove, path) then removed = removed + 1 end
            end
            for _, e in ipairs(AUDIO_EXTS) do
    pcall(fs.remove, join(AUDIO_DIR, tostring(key) .. "." .. e))
    pcall(fs.remove, join(AUDIO_DIR, tostring(key) .. "_b." .. e))
end
        end
        cache = {}
        mem_cache.soundtrack = {}
        mem_cache.khinsider = {}
        mem_cache.track_mp3 = {}
        save_cache()
        return json.encode({ ok = true, removed = removed })
    end)
    if not ok then logger:warn("clear_audio_cache crashed: " .. tostring(result)); return json.encode({ ok = false, error = "internal_error" }) end
    return result
end

function get_cache_list()
    return run_io("get_cache_list", function()
        local sizes = audio_dir_sizes()
        local items, count = {}, 0
        for key, entry in pairs(cache) do
            if entry and entry.file and sizes[entry.file] then
                items[tostring(key)] = { title_b64 = base64_encode(sanitize_text(entry.title or "")), bytes = sizes[entry.file], ts = entry.ts or 0 }
                count = count + 1
                if count >= MAX_LIST_ITEMS then break end
            end
        end
        return json.encode({ ok = true, items = items })
    end)
end

function clear_cache_for(app_id)
    local ok, result = pcall(function()
        local key = tostring(app_id)
        local entry = cache[key]
        local freed = 0
        if entry and entry.file then
            local path = join(AUDIO_DIR, entry.file)
            if fs and fs.exists and fs.exists(path) then freed = file_size(path) end
            pcall(fs.remove, path)
        end
        for _, e in ipairs(AUDIO_EXTS) do
    pcall(fs.remove, join(AUDIO_DIR, key .. "." .. e))
    pcall(fs.remove, join(AUDIO_DIR, key .. "_b." .. e))
end
        cache[key] = nil
        save_cache()
        return json.encode({ ok = true, bytes = freed })
    end)
    if not ok then logger:warn("clear_cache_for crashed: " .. tostring(result)); return json.encode({ ok = false, error = "internal_error" }) end
    return result
end

local function on_load()
    local prev_boot = tonumber(read_file(BOOT_MARKER) or "") or 0
    if prev_boot >= 1 then
        pcall(os.remove, CACHE_FILE)
        pcall(os.remove, RESOLVE_MARKER)
        if prev_boot >= 2 then
            local cdata = read_file(CUSTOM_FILE)
            if cdata and cdata ~= "" then write_file(CUSTOM_FILE .. ".bak", cdata) end
        end
        pcall(function() logger:warn("previous boot did not finish (attempt " .. prev_boot .. "); reset cache") end)
    end
    write_file(BOOT_MARKER, tostring(prev_boot + 1))
    load_state()
    local prev = read_file(RESOLVE_MARKER)
    if prev and prev ~= "" then
        cache[prev] = nil
        save_cache()
        pcall(os.remove, RESOLVE_MARKER)
        pcall(function() logger:warn("cleared cache after previous crash for app " .. prev) end)
    end
    pcall(os.remove, BOOT_MARKER)
    millennium.ready()
    cleanup_legacy_worker()
end

local function on_unload()
    pcall(os.remove, BOOT_MARKER)
    pcall(save_cache)
    pcall(save_settings)
    pcall(save_custom)
end

return { on_load = on_load, on_unload = on_unload }
