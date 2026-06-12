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

local PLUGIN_DIR = resolve_plugin_dir():gsub("/", "\\")
local CACHE_FILE = PLUGIN_DIR .. "\\cache.json"
local CONFIG_FILE = PLUGIN_DIR .. "\\settings.json"
local ICON_DIR = PLUGIN_DIR .. "\\icons"
local AUDIO_DIR = (millennium.steam_path():gsub("/", "\\")) .. "\\steamui\\game_theme_song"
local LOOPBACK_BASE = "https://steamloopback.host/game_theme_song/"
local QUEUE_DIR = PLUGIN_DIR .. "\\queue"
local LEGACY_FILES = {
    PLUGIN_DIR .. "\\yt-dlp.exe",
    PLUGIN_DIR .. "\\yt-dlp.exe.part",
    QUEUE_DIR .. "\\worker.alive",
    QUEUE_DIR .. "\\ytdlp-download.done",
    QUEUE_DIR .. "\\ytdlp-install.ps1",
}
local CONFIG_VERSION = 12

local DEFAULT_SETTINGS = {
    config_version = CONFIG_VERSION,
    enabled = true,
    volume = 0.35,
    fade_seconds = 1.5,
    search_suffix = " theme song",
    loop = true,
    max_seconds = 0,
    stop_on_launch = true,
}

local cache = {}
local settings = {}

local function safe_decode(str)
    if not str or str == "" then return nil end
    local ok, val = pcall(json.decode, str)
    if not ok then return nil end
    return val
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

local function merge_defaults(target, defaults)
    for k, v in pairs(defaults) do
        if target[k] == nil then target[k] = v end
    end
    return target
end

local function load_state()
    cache = safe_decode(read_file(CACHE_FILE)) or {}
    local loaded = safe_decode(read_file(CONFIG_FILE)) or {}
    if (loaded.config_version or 0) < CONFIG_VERSION then loaded.config_version = CONFIG_VERSION end
    settings = merge_defaults(loaded, DEFAULT_SETTINGS)
end

local function save_cache()
    write_file(CACHE_FILE, json.encode(cache))
end

local function save_settings()
    write_file(CONFIG_FILE, json.encode(settings))
end

local function cleanup_legacy_worker()
    write_file(QUEUE_DIR .. "\\worker.expected_version", "stop-" .. tostring(os.time()))
    for _, path in ipairs(LEGACY_FILES) do
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

function get_icon_data_uri(name)
    local safe = tostring(name or ""):match("^([%w%-]+%.svg)$")
    if not safe then return json.encode({ ok = false, error = "bad_icon_name" }) end
    local data = read_file(ICON_DIR .. "\\" .. safe)
    if not data then return json.encode({ ok = false, error = "icon_not_found" }) end
    return json.encode({ ok = true, data_uri = "data:image/svg+xml;base64," .. base64_encode(data) })
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

local AUDIO_EXTS = { "webm", "m4a", "mp3" }

local function looks_like_audio(path)
    local f = io.open(path, "rb")
    if not f then return false, "unreadable" end
    local head = f:read(16) or ""
    f:close()
    if #head < 4 then return false, "too_short" end
    local sig3, sig4 = head:sub(1, 3), head:sub(1, 4)
    if sig3 == "ID3" or sig4 == "OggS" or sig4 == "fLaC" or sig4 == "RIFF" then return true end
    local b1, b2 = head:byte(1, 2)
    if b1 == 255 and b2 and b2 >= 224 then return true end
    return false, head:gsub("%c", "."):sub(1, 16)
end

local function download_file(key, ext, url, ua)
    if not fs or not http or not http.download then return nil, "download_unsupported" end
    pcall(fs.create_directories, AUDIO_DIR)
    local filename = key .. "." .. ext
    local path = AUDIO_DIR .. "\\" .. filename
    for _, e in ipairs(AUDIO_EXTS) do
        if e ~= ext then pcall(fs.remove, AUDIO_DIR .. "\\" .. key .. "." .. e) end
    end
    local result, err = http.download(url, path, { timeout = 180, user_agent = ua })
    if not result or not result.success or result.status ~= 200 or (result.bytes_written or 0) <= 0 then
        pcall(fs.remove, path)
        local detail = err or (result and ("status_" .. tostring(result.status))) or "unknown"
        return nil, "download_failed: " .. tostring(detail)
    end
    local valid, head = looks_like_audio(path)
    if not valid then
        pcall(fs.remove, path)
        logger:warn("downloaded file is not audio (head=" .. tostring(head) .. ", bytes=" .. tostring(result.bytes_written) .. ") url=" .. tostring(url))
        return nil, "not_audio"
    end
    return filename, nil
end

local KHINSIDER_BASE = "https://downloads.khinsider.com"
local BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

local function khinsider_get(url)
    local resp, err = http.request(url, { method = "GET", timeout = 20, user_agent = BROWSER_UA })
    if resp and resp.status == 200 and resp.body then return resp.body, nil end
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

local function khinsider_pick_track(body)
    local tracks, seen = {}, {}
    for href, name in body:gmatch('<td class="clickable%-row"><a href="(/game%-soundtracks/album/[^"]+%.mp3)">([^<]+)</a>') do
        if not seen[href] then
            seen[href] = true
            tracks[#tracks + 1] = { href = href, name = name }
        end
    end
    if #tracks == 0 then return nil end
    local best, best_score = tracks[1], 0
    for i, tr in ipairs(tracks) do
        local n = " " .. tostring(tr.name):lower() .. " "
        local score = 0
        if n:find("main theme", 1, true) then score = 50
        elseif n:find("theme", 1, true) then score = 40
        elseif n:find("main menu", 1, true) then score = 35
        elseif n:find("title", 1, true) then score = 25
        elseif n:find("menu", 1, true) then score = 20 end
        score = score - i
        if score > best_score then best, best_score = tr, score end
    end
    return best
end

local function khinsider_resolve(game_name, key)
    if not http_available() then return nil, "http_module_missing" end
    local query = tostring(game_name):gsub("\226\132\162", ""):gsub("\194\174", ""):gsub("\194\169", "")
    local body, err = khinsider_get(KHINSIDER_BASE .. "/search?search=" .. url_encode(query))
    if not body then return nil, "khinsider_search_failed: " .. tostring(err) end
    local album = khinsider_pick_album(body, query)
    if not album then return nil, "khinsider_no_album" end
    local album_body, aerr = khinsider_get(KHINSIDER_BASE .. album.href)
    if not album_body then return nil, "khinsider_album_failed: " .. tostring(aerr) end
    local track = khinsider_pick_track(album_body)
    if not track then return nil, "khinsider_no_tracks" end
    local track_body, terr = khinsider_get(KHINSIDER_BASE .. track.href)
    if not track_body then return nil, "khinsider_track_failed: " .. tostring(terr) end
    local mp3 = track_body:match('href="(https://[^"]+%.mp3)"')
    if not mp3 then return nil, "khinsider_no_mp3_link" end
    local filename, dl_err = download_file(key, "mp3", mp3, BROWSER_UA)
    if not filename then return nil, dl_err end
    return { file = filename, title = track.name .. " (" .. album.title .. ")" }, nil
end

local SC_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
local sc_client_id = nil

local function sc_fetch_client_id()
    local resp = http.request("https://soundcloud.com/", { user_agent = SC_UA })
    if not resp or resp.status ~= 200 or not resp.body then return nil, "sc_home_failed" end
    local assets = {}
    for u in resp.body:gmatch('src="(https://a%-v2%.sndcdn%.com/assets/[^"]+%.js)"') do
        assets[#assets + 1] = u
    end
    for i = #assets, 1, -1 do
        local js = http.request(assets[i], { user_agent = SC_UA })
        if js and js.status == 200 and js.body then
            local cid = js.body:match('client_id%s*[:=]%s*"(%w+)"')
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
    return safe_decode(resp.body), nil
end

local function sc_resolve(game_name, key)
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
    for i = 1, math.min(#candidates, 3) do
        local c = candidates[i]
        local sep = c.stream_api:find("?", 1, true) and "&" or "?"
        local resp = http.request(c.stream_api .. sep .. "client_id=" .. tostring(sc_client_id), { user_agent = SC_UA })
        local meta = (resp and resp.status == 200 and resp.body) and safe_decode(resp.body) or nil
        if meta and type(meta.url) == "string" then
            local file, dl_err = download_file(key, "mp3", meta.url, SC_UA)
            if file then return { file = file, title = c.title }, nil end
            logger:warn("sc download failed: " .. tostring(dl_err))
        end
    end
    return nil, "sc_download_failed"
end

function get_theme_audio(app_id, force_refresh, game_name)
    local ok, result = pcall(function()
        if not game_name or game_name == "" then return json.encode({ ok = false, error = "missing_game_name" }) end
        local key = tostring(app_id)
        local entry = cache[key]
        if not force_refresh and entry and entry.file and fs and fs.exists and fs.exists(AUDIO_DIR .. "\\" .. entry.file) then
            local url = LOOPBACK_BASE .. entry.file .. "?v=" .. tostring(entry.ts or 0)
            return json.encode({ ok = true, url = url, title = entry.title, cached = true })
        end
        local r, kh_err = khinsider_resolve(game_name, key)
        if not (r and r.file) then
            local sc_err
            r, sc_err = sc_resolve(game_name, key)
            if not (r and r.file) then
                logger:warn("no theme audio for " .. tostring(game_name) .. " (khinsider: " .. tostring(kh_err) .. ", soundcloud: " .. tostring(sc_err) .. ")")
                return json.encode({ ok = false, error = sc_err or kh_err or "not_found" })
            end
        end
        local ts = os.time()
        cache[key] = { file = r.file, title = r.title, ts = ts }
        save_cache()
        local url = LOOPBACK_BASE .. r.file .. "?v=" .. tostring(ts)
        return json.encode({ ok = true, url = url, title = r.title, cached = false })
    end)
    if not ok then logger:warn("get_theme_audio crashed: " .. tostring(result)); return json.encode({ ok = false, error = "internal_error" }) end
    return result
end

function invalidate_audio(app_id)
    local key = tostring(app_id)
    if fs and fs.remove then
        pcall(fs.remove, AUDIO_DIR .. "\\" .. key .. ".webm")
        pcall(fs.remove, AUDIO_DIR .. "\\" .. key .. ".m4a")
        pcall(fs.remove, AUDIO_DIR .. "\\" .. key .. ".mp3")
    end
    cache[key] = nil
    save_cache()
    return json.encode({ ok = true })
end

function get_settings()
    local fresh = safe_decode(read_file(CONFIG_FILE))
    if type(fresh) == "table" then settings = merge_defaults(fresh, DEFAULT_SETTINGS) end
    return json.encode(settings)
end

function set_setting(key, value)
    if DEFAULT_SETTINGS[key] == nil then return json.encode({ ok = false, error = "unknown_key" }) end
    settings[key] = value
    if not write_file(CONFIG_FILE, json.encode(settings)) then return json.encode({ ok = false, error = "write_failed" }) end
    return json.encode({ ok = true })
end

function log_frontend(message)
    logger:info("[frontend] " .. tostring(message))
    return json.encode({ ok = true })
end

local function on_load()
    load_state()
    millennium.ready()
    cleanup_legacy_worker()
end

local function on_unload()
    save_cache()
    save_settings()
end

return { on_load = on_load, on_unload = on_unload }
