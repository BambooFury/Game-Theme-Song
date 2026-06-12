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
local CONFIG_VERSION = 9

local DEFAULT_SETTINGS = {
    config_version = CONFIG_VERSION,
    enabled = true,
    volume = 0.35,
    fade_seconds = 1.5,
    search_suffix = " theme song",
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

local INNERTUBE_CLIENTS = {
    {
        label = "ios",
        client_name_id = "5",
        user_agent = "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)",
        context = {
            client = {
                clientName = "IOS",
                clientVersion = "20.10.4",
                deviceMake = "Apple",
                deviceModel = "iPhone16,2",
                osName = "iPhone",
                osVersion = "18.3.2.22D82",
                hl = "en",
            },
        },
    },
    {
        label = "android",
        client_name_id = "3",
        user_agent = "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip",
        context = {
            client = {
                clientName = "ANDROID",
                clientVersion = "20.10.38",
                androidSdkVersion = 30,
                osName = "Android",
                osVersion = "11",
                hl = "en",
            },
        },
    },
    {
        label = "android_vr",
        client_name_id = "28",
        user_agent = "com.google.android.apps.youtube.vr.oculus/1.62.27 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip",
        context = {
            client = {
                clientName = "ANDROID_VR",
                clientVersion = "1.62.27",
                deviceMake = "Oculus",
                deviceModel = "Quest 3",
                androidSdkVersion = 32,
                osName = "Android",
                osVersion = "12L",
                hl = "en",
            },
        },
    },
    {
        label = "ios_music",
        client_name_id = "26",
        user_agent = "com.google.ios.youtubemusic/7.27.0 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)",
        context = {
            client = {
                clientName = "IOS_MUSIC",
                clientVersion = "7.27.0",
                deviceMake = "Apple",
                deviceModel = "iPhone16,2",
                osName = "iPhone",
                osVersion = "18.3.2.22D82",
                hl = "en",
            },
        },
    },
    {
        label = "android_music",
        client_name_id = "21",
        user_agent = "com.google.android.apps.youtube.music/7.27.52 (Linux; U; Android 11) gzip",
        context = {
            client = {
                clientName = "ANDROID_MUSIC",
                clientVersion = "7.27.52",
                androidSdkVersion = 30,
                osName = "Android",
                osVersion = "11",
                hl = "en",
            },
        },
    },
}

local function http_available()
    return http ~= nil and http.request ~= nil
end

local function duration_to_seconds(text)
    local total = 0
    for n in tostring(text):gmatch("%d+") do total = total * 60 + tonumber(n) end
    return total
end

local function parse_video_candidates(body, max_count)
    local out, seen = {}, {}
    local pos = 1
    while #out < max_count do
        local s, e, vid = body:find('"videoId":"([%w_%-]+)"', pos)
        if not s then break end
        pos = e + 1
        if #vid == 11 and not seen[vid] then
            seen[vid] = true
            local window = body:sub(e, e + 3000)
            local dur_text = window:match('"lengthText":.-"simpleText":"([%d:]+)"')
            out[#out + 1] = { id = vid, seconds = dur_text and duration_to_seconds(dur_text) or nil }
        end
    end
    return out
end

local function order_candidates(candidates)
    local short, medium, rest = {}, {}, {}
    for _, c in ipairs(candidates) do
        if c.seconds and c.seconds >= 60 and c.seconds <= 600 then
            short[#short + 1] = c
        elseif c.seconds and c.seconds <= 1200 then
            medium[#medium + 1] = c
        else
            rest[#rest + 1] = c
        end
    end
    local out = {}
    for _, bucket in ipairs({ short, medium, rest }) do
        for _, c in ipairs(bucket) do out[#out + 1] = c end
    end
    return out
end

local function search_video_ids(query)
    if not http_available() then return nil, "http_module_missing" end
    local url = "https://www.youtube.com/results?search_query=" .. url_encode(query)
    local resp, err = http.request(url, {
        method = "GET",
        timeout = 15,
        user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        headers = { ["Accept-Language"] = "en-US,en;q=0.9" },
    })
    if resp and resp.status == 200 and resp.body then
        local candidates = parse_video_candidates(resp.body, 8)
        if #candidates > 0 then return order_candidates(candidates), nil end
    end
    local payload = json.encode({
        context = { client = { clientName = "WEB", clientVersion = "2.20250312.04.00", hl = "en" } },
        query = query,
        params = "EgIQAQ==",
    })
    local resp2, err2 = http.request("https://www.youtube.com/youtubei/v1/search?prettyPrint=false", {
        method = "POST",
        data = payload,
        timeout = 15,
        user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        headers = { ["Content-Type"] = "application/json" },
    })
    if resp2 and resp2.status == 200 and resp2.body then
        local candidates = parse_video_candidates(resp2.body, 8)
        if #candidates > 0 then return order_candidates(candidates), nil end
        return nil, "search_no_results"
    end
    return nil, "search_failed: " .. tostring(err or err2 or (resp and resp.status) or (resp2 and resp2.status))
end

local function pick_audio_format(formats)
    if type(formats) ~= "table" then return nil end
    local best_webm, best_mp4 = nil, nil
    for _, f in ipairs(formats) do
        local mime = tostring(f.mimeType or "")
        if type(f.url) == "string" and f.url ~= "" and mime:find("^audio/") then
            local bitrate = tonumber(f.bitrate) or 0
            if mime:find("^audio/webm") then
                if not best_webm or bitrate > (tonumber(best_webm.bitrate) or 0) then best_webm = f end
            elseif mime:find("^audio/mp4") then
                if not best_mp4 or bitrate > (tonumber(best_mp4.bitrate) or 0) then best_mp4 = f end
            end
        end
    end
    return best_webm or best_mp4
end

local function fetch_player(video_id, client)
    local payload = json.encode({
        context = client.context,
        videoId = video_id,
        contentCheckOk = true,
        racyCheckOk = true,
    })
    local resp, err = http.request("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
        method = "POST",
        data = payload,
        timeout = 15,
        user_agent = client.user_agent,
        headers = {
            ["Content-Type"] = "application/json",
            ["X-Youtube-Client-Name"] = client.client_name_id,
            ["X-Youtube-Client-Version"] = client.context.client.clientVersion,
        },
    })
    if not resp then return nil, "player_request_failed: " .. tostring(err) end
    if resp.status ~= 200 then return nil, "player_http_" .. tostring(resp.status) end
    local data = safe_decode(resp.body)
    if type(data) ~= "table" then return nil, "player_bad_json" end
    local status = type(data.playabilityStatus) == "table" and data.playabilityStatus.status or "UNKNOWN"
    if status ~= "OK" then return nil, "player_status_" .. tostring(status) end
    local streaming = data.streamingData
    if type(streaming) ~= "table" then return nil, "player_no_streaming_data" end
    local fmt = pick_audio_format(streaming.adaptiveFormats) or pick_audio_format(streaming.formats)
    if not fmt then return nil, "player_no_audio_format" end
    local title = type(data.videoDetails) == "table" and data.videoDetails.title or ""
    return { url = fmt.url, title = tostring(title or ""), mime = tostring(fmt.mimeType or ""), ua = client.user_agent }, nil
end

local function ext_for_mime(mime)
    if tostring(mime):find("^audio/mp4") then return "m4a" end
    return "webm"
end

local AUDIO_EXTS = { "webm", "m4a", "mp3" }

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
    logger:info("downloaded " .. filename .. " (" .. tostring(result.bytes_written) .. " bytes)")
    return filename, nil
end

local function download_audio(key, stream)
    return download_file(key, ext_for_mime(stream.mime), stream.url, stream.ua)
end

local KHINSIDER_BASE = "https://downloads.khinsider.com"
local BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

local function khinsider_get(url)
    local resp, err = http.request(url, { method = "GET", timeout = 20, user_agent = BROWSER_UA })
    if resp and resp.status == 200 and resp.body then return resp.body, nil end
    return nil, tostring(err or (resp and resp.status) or "no_response")
end

local function norm_words(text)
    local t = tostring(text):lower():gsub("[^%w]+", " "):gsub("^%s+", ""):gsub("%s+$", "")
    return " " .. t .. " "
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
    logger:info("khinsider album: " .. album.title)
    local album_body, aerr = khinsider_get(KHINSIDER_BASE .. album.href)
    if not album_body then return nil, "khinsider_album_failed: " .. tostring(aerr) end
    local track = khinsider_pick_track(album_body)
    if not track then return nil, "khinsider_no_tracks" end
    logger:info("khinsider track: " .. track.name)
    local track_body, terr = khinsider_get(KHINSIDER_BASE .. track.href)
    if not track_body then return nil, "khinsider_track_failed: " .. tostring(terr) end
    local mp3 = track_body:match('href="(https://[^"]+%.mp3)"')
    if not mp3 then return nil, "khinsider_no_mp3_link" end
    local filename, dl_err = download_file(key, "mp3", mp3, BROWSER_UA)
    if not filename then return nil, dl_err end
    return { file = filename, title = track.name .. " (" .. album.title .. ")" }, nil
end

local function resolve_stream(video_id, key)
    local last_err = "no_clients"
    local fallback = nil
    for _, client in ipairs(INNERTUBE_CLIENTS) do
        local result, err = fetch_player(video_id, client)
        if result then
            logger:info("resolved stream via " .. client.label .. " client")
            local filename, dl_err = download_audio(key, result)
            if filename then
                return { file = filename, title = result.title }, nil
            end
            logger:warn("download via " .. client.label .. " failed: " .. tostring(dl_err))
            last_err = tostring(dl_err)
            if not fallback then fallback = result end
        else
            last_err = tostring(err)
            logger:warn("client " .. client.label .. " failed: " .. last_err)
        end
    end
    if fallback then
        return { url = fallback.url, title = fallback.title, direct = true }, nil
    end
    return nil, last_err
end

local function resolve_audio(game_name, key)
    if type(game_name) ~= "string" or game_name == "" then return nil, "missing_game_name" end
    if not http_available() then return nil, "http_module_missing" end
    local query = game_name .. (settings.search_suffix or "")
    logger:info("resolve_audio: " .. query)
    local candidates, search_err = search_video_ids(query)
    if not candidates or #candidates == 0 then
        logger:warn("youtube search failed: " .. tostring(search_err))
        return nil, search_err or "search_no_results"
    end
    local fallback = nil
    local last_err = "not_found"
    for i = 1, math.min(#candidates, 3) do
        local c = candidates[i]
        logger:info("trying video " .. c.id .. " (" .. tostring(c.seconds or "?") .. "s)")
        local stream, stream_err = resolve_stream(c.id, key)
        if stream and stream.file then
            stream.video_id = c.id
            return stream, nil
        end
        if stream and stream.direct and not fallback then
            stream.video_id = c.id
            fallback = stream
        end
        last_err = tostring(stream_err or "download_failed")
    end
    if candidates[1] then
        return { embed = true, video_id = candidates[1].id }, nil
    end
    if fallback then
        logger:warn("no candidate downloaded, using direct url fallback")
        return fallback, nil
    end
    return nil, last_err
end


function get_theme_audio(app_id, force_refresh, game_name)
    local ok, result = pcall(function()
        if not game_name or game_name == "" then return json.encode({ ok = false, error = "missing_game_name" }) end
        local key = tostring(app_id)
        local entry = cache[key]
        if not force_refresh and entry and entry.file and fs and fs.exists and fs.exists(AUDIO_DIR .. "\\" .. entry.file) then
            local url = LOOPBACK_BASE .. entry.file .. "?v=" .. tostring(entry.ts or 0)
            return json.encode({ ok = true, url = url, title = entry.title, video_id = entry.video_id, cached = true })
        end
        local r, kh_err = khinsider_resolve(game_name, key)
        if not r then
            logger:info("khinsider failed (" .. tostring(kh_err) .. "), trying youtube")
            local yt, yt_err = resolve_audio(game_name, key)
            if not yt then return json.encode({ ok = false, error = yt_err or "not_found" }) end
            r = yt
        end
        if r.file then
            local ts = os.time()
            cache[key] = { file = r.file, video_id = r.video_id, title = r.title, ts = ts }
            save_cache()
            local url = LOOPBACK_BASE .. r.file .. "?v=" .. tostring(ts)
            return json.encode({ ok = true, url = url, title = r.title, video_id = r.video_id, cached = false })
        end
        if r.embed then
            logger:warn("all downloads failed, using embed player fallback")
            return json.encode({ ok = true, embed = true, video_id = r.video_id, title = r.title, cached = false })
        end
        logger:warn("all downloads failed, falling back to direct url")
        return json.encode({ ok = true, url = r.url, title = r.title, video_id = r.video_id, cached = false, direct = true })
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
    logger:info("Game Theme Song loaded in direct-http mode (no external processes)")
end

local function on_unload()
    save_cache()
    save_settings()
end

return { on_load = on_load, on_unload = on_unload }
