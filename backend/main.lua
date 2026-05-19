local logger     = require("logger")

local millennium = require("millennium")

local json       = require("json")



local ok_http, http = pcall(require, "http")

if not ok_http then

    logger:warn("http module unavailable: " .. tostring(http))

    http = nil

end



local function resolve_plugin_dir()

    local source = debug.getinfo(1, "S").source or ""

    if source:sub(1, 1) == "@" then source = source:sub(2) end

    local dir = source:match("^(.+)[/\\]backend[/\\][^/\\]+$")

    if dir then return dir end

    return millennium.steam_path() .. "/millennium/plugins/Game Theme Song on Game Page"

end



local PLUGIN_DIR   = resolve_plugin_dir()

local CACHE_FILE   = PLUGIN_DIR .. "/cache.json"

local CONFIG_FILE  = PLUGIN_DIR .. "/settings.json"



local CONFIG_VERSION = 3



local DEFAULT_SETTINGS = {

    config_version = CONFIG_VERSION,

    enabled        = true,

    volume         = 0.35,

    fade_seconds   = 1.5,

    search_suffix  = " theme song",

    piped_hosts = {

        "https://pipedapi.kavin.rocks",

        "https://pipedapi.leptons.xyz",

        "https://pipedapi.adminforge.de",

        "https://api.piped.private.coffee",

    },

    invidious_hosts = {},

}



local cache    = {}

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

        if target[k] == nil then

            target[k] = v

        end

    end

    return target

end



local function load_state()

    cache = safe_decode(read_file(CACHE_FILE)) or {}



    local loaded = safe_decode(read_file(CONFIG_FILE)) or {}

    if (loaded.config_version or 0) < CONFIG_VERSION then

        loaded.invidious_hosts = nil

        loaded.piped_hosts = nil

        loaded.config_version = CONFIG_VERSION

    end

    settings = merge_defaults(loaded, DEFAULT_SETTINGS)

end



local function save_cache()

    write_file(CACHE_FILE, json.encode(cache))

end



local function save_settings()

    local ok = write_file(CONFIG_FILE, json.encode(settings))

    if not ok then

        logger:warn("failed to write settings to " .. CONFIG_FILE)

    end

end



local function urlencode(str)

    if not str then return "" end

    str = str:gsub("\n", "\r\n")

    str = str:gsub("([^%w%-_%.~])", function(c)

        return string.format("%%%02X", string.byte(c))

    end)

    return str

end



local HTTP_OPTS = {

    timeout         = 5,

    follow_redirects = true,

    verify_ssl      = true,

    user_agent      = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",

}



local MAX_CANDIDATES_PER_HOST = 2

local RESOLVE_BUDGET_SECONDS = 22



local dead_hosts = {}

local resolve_deadline = 0



local function host_of(url)

    return url:match("^(https?://[^/]+)") or url

end



local function over_budget()

    return resolve_deadline > 0 and os.time() >= resolve_deadline

end



local function http_get_json(url)

    if not http or over_budget() then return nil end

    local h = host_of(url)

    if dead_hosts[h] then return nil end

    local resp, err = http.get(url, HTTP_OPTS)

    if not resp then

        dead_hosts[h] = true

        return nil

    end

    if resp.status < 200 or resp.status >= 300 then

        if resp.status >= 500 then dead_hosts[h] = true end

        return nil

    end

    return safe_decode(resp.body)

end



local function resolve_via_invidious(query)

    local q = urlencode(query)

    for _, host in ipairs(settings.invidious_hosts) do

        if not dead_hosts[host_of(host)] then

            local search_url = host .. "/api/v1/search?type=video&q=" .. q

            local results = http_get_json(search_url)

            if results and type(results) == "table" and results[1] then

                local tried = 0

                for _, item in ipairs(results) do

                    if tried >= MAX_CANDIDATES_PER_HOST then break end

                    if dead_hosts[host_of(host)] or over_budget() then break end

                    local vid = item.videoId

                    local is_live = item.liveNow == true

                    if vid and not is_live then

                        tried = tried + 1

                        local video = http_get_json(host .. "/api/v1/videos/" .. vid)

                        if video and video.adaptiveFormats then

                            local best, best_br = nil, -1

                            for _, fmt in ipairs(video.adaptiveFormats) do

                                local mime = fmt.type or ""

                                if mime:find("audio/", 1, true) then

                                    local br = tonumber(fmt.bitrate) or 0

                                    if br > best_br then

                                        best_br = br

                                        best = fmt.url

                                    end

                                end

                            end

                            if best then

                                return {

                                    url      = best,

                                    video_id = vid,

                                    title    = video.title or item.title,

                                    source   = "invidious:" .. host,

                                }

                            end

                        end

                    end

                end

            end

        end

    end

    return nil

end



local function unproxy_piped(proxy_url)

    if type(proxy_url) ~= "string" then return nil end

    local host = proxy_url:match("[?&]host=([^&]+)")

    if not host or host == "" then return nil end

    local path_and_query = proxy_url:match("^https?://[^/]+(/.+)$")

    if not path_and_query then return nil end

    path_and_query = path_and_query:gsub("([?&])host=[^&]*&?", "%1")

    path_and_query = path_and_query:gsub("[&?]$", "")

    return "https://" .. host .. path_and_query

end



local function resolve_via_piped(query)

    local q = urlencode(query)

    for _, host in ipairs(settings.piped_hosts) do

        if not dead_hosts[host_of(host)] then

            local search = http_get_json(host .. "/search?filter=videos&q=" .. q)

            if search and search.items and search.items[1] then

                local tried = 0

                for _, item in ipairs(search.items) do

                    if tried >= MAX_CANDIDATES_PER_HOST then break end

                    if dead_hosts[host_of(host)] or over_budget() then break end

                    local url = item.url or ""

                    local vid = url:match("v=([%w%-_]+)")

                    if vid and item.isShort ~= true and item.duration and item.duration > 0 then

                        tried = tried + 1

                        local streams = http_get_json(host .. "/streams/" .. vid)

                        if streams and streams.audioStreams then

                            local best, best_br, best_is_mp4 = nil, -1, false

                            for _, s in ipairs(streams.audioStreams) do

                                local br = tonumber(s.bitrate) or 0

                                local mt = s.mimeType or ""

                                local is_mp4 = mt:find("audio/mp4", 1, true) ~= nil

                                local better

                                if is_mp4 ~= best_is_mp4 then

                                    better = is_mp4 and not best_is_mp4

                                else

                                    better = br > best_br

                                end

                                if better then

                                    best_br = br

                                    best = s.url

                                    best_is_mp4 = is_mp4

                                end

                            end

                            if best then

                                local direct = unproxy_piped(best)

                                return {

                                    url       = direct or best,

                                    proxy_url = (direct and best) or nil,

                                    video_id  = vid,

                                    title     = streams.title or item.title,

                                    source    = "piped:" .. host,

                                }

                            end

                        end

                    end

                end

            end

        end

    end

    return nil

end



local function resolve_audio(game_name)

    dead_hosts = {}

    resolve_deadline = os.time() + RESOLVE_BUDGET_SECONDS

    if type(game_name) ~= "string" then return nil end

    local query = game_name .. (settings.search_suffix or "")

    local result = resolve_via_piped(query)

    if not result and not over_budget() then

        result = resolve_via_invidious(query)

    end

    if not result then

        logger:warn("No audio for: " .. query)

    else

        logger:info("Resolved " .. tostring(game_name) .. " -> " .. tostring(result.title))

    end

    return result

end



function get_theme_audio(app_id, force_refresh, game_name)

    if not http then

        return json.encode({ ok = false, error = "http_module_unavailable" })

    end

    if not game_name or game_name == "" then

        return json.encode({ ok = false, error = "missing_game_name" })

    end



    local key = tostring(app_id)

    if not force_refresh and cache[key] and cache[key].url then

        local entry = cache[key]

        return json.encode({

            ok        = true,

            url       = entry.url,

            proxy_url = entry.proxy_url,

            title     = entry.title,

            video_id  = entry.video_id,

            cached    = true,

        })

    end



    local result = resolve_audio(game_name)

    if not result then

        return json.encode({ ok = false, error = "not_found" })

    end



    cache[key] = {

        url       = result.url,

        proxy_url = result.proxy_url,

        video_id  = result.video_id,

        title     = result.title,

        source    = result.source,

        ts        = os.time(),

    }

    save_cache()



    return json.encode({

        ok        = true,

        url       = result.url,

        proxy_url = result.proxy_url,

        title     = result.title,

        video_id  = result.video_id,

        cached    = false,

    })

end



function invalidate_audio(app_id)

    cache[tostring(app_id)] = nil

    save_cache()

    return json.encode({ ok = true })

end



function get_settings()

    local fresh = safe_decode(read_file(CONFIG_FILE))

    if type(fresh) == "table" then

        settings = merge_defaults(fresh, DEFAULT_SETTINGS)

    end

    return json.encode(settings)

end



function set_setting(key, value)

    if DEFAULT_SETTINGS[key] == nil then

        return json.encode({ ok = false, error = "unknown_key" })

    end

    settings[key] = value

    local ok = write_file(CONFIG_FILE, json.encode(settings))

    if not ok then

        logger:warn("failed to persist " .. key .. " to " .. CONFIG_FILE)

        return json.encode({ ok = false, error = "write_failed", path = CONFIG_FILE })

    end

    return json.encode({ ok = true })

end



local function on_load()

    load_state()

    logger:info("Game Theme Song plugin loaded (dir=" .. PLUGIN_DIR .. ")")

    millennium.ready()

end



local function on_unload()

    save_cache()

    save_settings()

end



local function on_frontend_loaded()

end



return {

    on_load            = on_load,

    on_unload          = on_unload,

    on_frontend_loaded = on_frontend_loaded,

}

