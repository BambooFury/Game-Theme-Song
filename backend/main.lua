local logger     = require("logger")
local millennium = require("millennium")
local json       = require("json")
local ok_fs, fs = pcall(require, "fs"); if not ok_fs then fs = nil end
local ok_utils, utils = pcall(require, "utils"); if not ok_utils then utils = nil end
local ok_http, http = pcall(require, "http"); if not ok_http then http = nil end

-- Win32 FFI убран — вызывает краш плагина при загрузке
local ok_ffi = false
local ffi = nil

local function resolve_plugin_dir()
    local source = debug.getinfo(1, "S").source or ""
    if source:sub(1, 1) == "@" then source = source:sub(2) end
    local dir = source:match("^(.+)[/\\]backend[/\\][^/\\]+$")
    if dir then return dir end
    return millennium.steam_path().. "/millennium/plugins/Game Theme Song on Game Page"
end

local PLUGIN_DIR = resolve_plugin_dir():gsub("/", "\\")
local CACHE_FILE = PLUGIN_DIR.. "\\cache.json"
local CONFIG_FILE = PLUGIN_DIR.. "\\settings.json"
local ICON_DIR = PLUGIN_DIR.. "\\icons"
local YTDLP_PATH = PLUGIN_DIR.. "\\yt-dlp.exe"
local YTDLP_PART = PLUGIN_DIR.. "\\yt-dlp.exe.part"
local WORKER_VBS = PLUGIN_DIR.. "\\worker.vbs"
local QUEUE_DIR = PLUGIN_DIR.. "\\queue"
local WORKER_ALIVE = QUEUE_DIR.. "\\worker.alive"
local WORKER_VERSION_FILE = QUEUE_DIR.. "\\worker.expected_version"
local DOWNLOAD_DONE = QUEUE_DIR.. "\\ytdlp-download.done"
local WORKER_VERSION = "2026-06-10-single-window-fix"
local YTDLP_URL = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
local CONFIG_VERSION = 8

local DEFAULT_SETTINGS = {
    config_version = CONFIG_VERSION,
    enabled = true,
    volume = 0.35,
    fade_seconds = 1.5,
    search_suffix = " theme song",
    cache_ttl_seconds = 3 * 60 * 60,
}

local cache = {}
local settings = {}
local start_worker

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

local function file_size(path)
    local f = io.open(path, "rb")
    if not f then return 0 end
    local size = f:seek("end") or 0
    f:close()
    return size
end

local function file_exists(path)
    if fs and fs.exists then return fs.exists(path) end
    local f = io.open(path, "rb")
    if f then f:close(); return true end
    return false
end

local function ensure_dir(path)
    if fs and fs.create_directories then fs.create_directories(path) end
end

local function sleep_ms(ms)
    if utils and utils.sleep then
        utils.sleep(ms)
        return
    end
    local deadline = os.clock() + ms / 1000
    while os.clock() < deadline do end
end

local function spawn_hidden(cmdline)
    if utils and utils.exec then
        utils.exec(cmdline)
    end
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

local function ytdlp_present()
    return file_size(YTDLP_PATH) >= 1024 * 1024
end

local b64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
local b64lookup = {}
for i = 1, #b64chars do
    b64lookup[b64chars:sub(i, i)] = i - 1
end

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

local function base64_decode(data)
    data = tostring(data or ""):gsub("%s", "")
    local out = {}
    local out_i = 1
    for i = 1, #data, 4 do
        local c1 = data:sub(i, i)
        local c2 = data:sub(i + 1, i + 1)
        local c3 = data:sub(i + 2, i + 2)
        local c4 = data:sub(i + 3, i + 3)
        local b1 = b64lookup[c1]
        local b2 = b64lookup[c2]
        if b1 == nil or b2 == nil then break end
        local b3 = c3 == "=" and nil or b64lookup[c3]
        local b4 = c4 == "=" and nil or b64lookup[c4]
        local n = b1 * 262144 + b2 * 4096 + (b3 or 0) * 64 + (b4 or 0)
        out[out_i] = string.char(math.floor(n / 65536) % 256)
        out_i = out_i + 1
        if b3 ~= nil then
            out[out_i] = string.char(math.floor(n / 256) % 256)
            out_i = out_i + 1
        end
        if b4 ~= nil then
            out[out_i] = string.char(n % 256)
            out_i = out_i + 1
        end
    end
    return table.concat(out)
end

function get_icon_data_uri(name)
    local safe = tostring(name or ""):match("^([%w%-]+%.svg)$")
    if not safe then return json.encode({ ok = false, error = "bad_icon_name" }) end
    local data = read_file(ICON_DIR.. "\\".. safe)
    if not data then return json.encode({ ok = false, error = "icon_not_found" }) end
    return json.encode({ ok = true, data_uri = "data:image/svg+xml;base64,".. base64_encode(data) })
end

function ytdlp_download_url()
    return json.encode({ ok = true, url = YTDLP_URL })
end

function ytdlp_upload_begin()
    pcall(os.remove, YTDLP_PART)
    pcall(os.remove, YTDLP_PATH)
    return json.encode({ ok = true })
end

function ytdlp_upload_chunk(params)
    local ok, result = pcall(function()
        local offset = tonumber(type(params) == "table" and params.offset or params) or 0
        local data = type(params) == "table" and params.data or ""
        local decoded = base64_decode(data)
        local mode = offset == 0 and "wb" or "ab"
        local f = io.open(YTDLP_PART, mode)
        if not f then return { ok = false, error = "open_failed" } end
        f:write(decoded)
        f:close()
        return { ok = true, written = #decoded, size = file_size(YTDLP_PART) }
    end)
    if not ok then return json.encode({ ok = false, error = tostring(result) }) end
    return json.encode(result)
end

function ytdlp_upload_finish(params)
    local expected_size = tonumber(type(params) == "table" and params.expected_size or params) or 0
    local size = file_size(YTDLP_PART)
    if size < 1024 * 1024 then
        return json.encode({ ok = false, error = "too_small", size = size })
    end
    if expected_size > 0 and math.abs(size - expected_size) > 16 then
        return json.encode({ ok = false, error = "size_mismatch", size = size, expected = expected_size })
    end
    pcall(os.remove, YTDLP_PATH)
    local ok = os.rename(YTDLP_PART, YTDLP_PATH)
    if not ok then return json.encode({ ok = false, error = "rename_failed" }) end
    return json.encode({ ok = true, size = file_size(YTDLP_PATH) })
end

local last_dl_start = 0

function ytdlp_hidden_download_start()
    ensure_dir(QUEUE_DIR)
    if ytdlp_present() then return json.encode({ ok = true, already_present = true }) end

    local now = os.time()
    if now - last_dl_start < 5 then
        return json.encode({ ok = true, already_running = true })
    end
    last_dl_start = now

    local current_flag = read_file(DOWNLOAD_DONE)
    if file_size(YTDLP_PART) > 0 and not current_flag then
        return json.encode({ ok = true, already_running = true })
    end
    pcall(os.remove, DOWNLOAD_DONE)
    pcall(os.remove, YTDLP_PART)
    pcall(os.remove, YTDLP_PATH)

    -- Пишем PS1 скрипт на диск
    local ps1_path = QUEUE_DIR.. "\\ytdlp-install.ps1"
    local done_flag = DOWNLOAD_DONE
    local dest = YTDLP_PATH
    local tmp = YTDLP_PART
    local url = YTDLP_URL
    local ps1 = table.concat({
        "$ErrorActionPreference='Stop'",
        "$url='".. url.. "'",
        "$dest='".. dest.. "'",
        "$tmp='".. tmp.. "'",
        "$doneFlag='".. done_flag.. "'",
        "$scriptPath='".. ps1_path.. "'",
        "$Host.UI.RawUI.WindowTitle='Game Theme Song - Downloading yt-dlp'",
        "$Host.UI.RawUI.BackgroundColor='Black'",
        "Clear-Host",
        "function Draw{param([int]$p,[string]$s,[string]$c='Cyan')",
        "  Clear-Host",
        "  Write-Host ''",
        "  Write-Host '  ==============================================' -ForegroundColor DarkCyan",
        "  Write-Host '      Game Theme Song  -  yt-dlp Installer'     -ForegroundColor White",
        "  Write-Host '  ==============================================' -ForegroundColor DarkCyan",
        "  Write-Host ''",
        "  $b=[int]($p/2.5);Write-Host \"  [$('#'*$b)$('-'*(40-$b))] $p%\" -ForegroundColor $c",
        "  Write-Host ''",
        "  Write-Host \"  $s\" -ForegroundColor $c",
        "  Write-Host ''",
        "}",
        "try{",
        "  Draw 0 'Starting download...' 'Yellow'",
        "  $wc=New-Object System.Net.WebClient",
        "  $wc.Headers.Add('User-Agent','Mozilla/5.0 (game-theme-song)')",
        "  $lastPct=0",
        "  Register-ObjectEvent $wc DownloadProgressChanged -Action{",
        "    $pct=$EventArgs.ProgressPercentage",
        "    if($pct -ne $script:lastPct){",
        "      $script:lastPct=$pct",
        "      $recv=[math]::Round($EventArgs.BytesReceived/1MB,1)",
        "      $tot=[math]::Round($EventArgs.TotalBytesToReceive/1MB,1)",
        "      Draw $pct \"Downloading... $recv MB / $tot MB\" 'Cyan'",
        "    }",
        "  }|Out-Null",
        "  $wc.DownloadFileAsync([uri]$url,$tmp)",
        "  while($wc.IsBusy){Start-Sleep -Milliseconds 100}",
        "  $wc.Dispose()",
        "  Draw 100 'Finalizing...' 'Yellow'",
        "  $sz=(Get-Item $tmp).Length",
        "  if($sz -lt 1048576){throw \"File too small: $sz bytes\"}",
        "  Move-Item -Force $tmp $dest",
        "  [IO.File]::WriteAllText($doneFlag,'ok:'+$sz)",
        "  Draw 100 'Done! yt-dlp installed successfully.' 'Green'",
        "  Start-Sleep -Seconds 2",
        "}catch{",
        "  [IO.File]::WriteAllText($doneFlag,'err:'+$_.Exception.Message)",
        "  Write-Host ''",
        "  Write-Host \"  ERROR: $($_.Exception.Message)\" -ForegroundColor Red",
        "  Write-Host '  Press any key to close...' -ForegroundColor Gray",
        "  $null=$Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')",
        "}finally{",
        "  Remove-Item -Force $scriptPath -ErrorAction SilentlyContinue",
        "}",
    }, "\n")
    write_file(ps1_path, ps1)

    -- ФИКС БАГА 1: запускаем PowerShell напрямую одним процессом.
    -- Никаких промежуточных VBS-лаунчеров -> ровно одно окно с прогрессом.
    spawn_hidden('powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Normal -File "'.. ps1_path.. '"')
    return json.encode({ ok = true })
end

function ytdlp_hidden_download_status()
    if ytdlp_present() then return json.encode({ state = "done", size = file_size(YTDLP_PATH) }) end
    local flag = read_file(DOWNLOAD_DONE)
    if not flag then return json.encode({ state = "running", size = file_size(YTDLP_PART) }) end
    if flag:sub(1, 3) == "ok:" then
        return json.encode({ state = "error", error = "download_finished_but_file_missing", size = file_size(YTDLP_PATH) })
    end
    return json.encode({ state = "error", error = flag })
end

local function write_expected_version()
    ensure_dir(QUEUE_DIR)
    write_file(WORKER_VERSION_FILE, WORKER_VERSION)
end

local function stop_existing_worker()
    ensure_dir(QUEUE_DIR)
    write_file(WORKER_VERSION_FILE, "stop-".. tostring(os.time()))
    if file_exists(WORKER_ALIVE) then pcall(os.remove, WORKER_ALIVE) end
end

local function expected_version_matches()
    local current = read_file(WORKER_VERSION_FILE)
    if not current then return false end
    current = current:gsub("%s+$", "")
    return current == WORKER_VERSION
end

local function worker_alive()
    if not expected_version_matches() then return false end
    if not file_exists(WORKER_ALIVE) then return false end
    if fs and fs.last_write_time then
        local mtime = fs.last_write_time(WORKER_ALIVE)
        if not mtime then return false end
        return (os.time() - mtime) < 8
    end
    return true
end

start_worker = function()
    if not ytdlp_present() then return false end
    ensure_dir(QUEUE_DIR)
    write_expected_version()
    if file_exists(WORKER_ALIVE) then pcall(os.remove, WORKER_ALIVE) end
    local cmd = 'wscript.exe //nologo //B "'.. WORKER_VBS.. '" --detach "'.. YTDLP_PATH.. '" "'.. QUEUE_DIR.. '" "'.. WORKER_ALIVE.. '" "'.. WORKER_VERSION.. '"'
    logger:info("starting detached hidden yt-dlp worker")
    spawn_hidden(cmd)
    local waited = 0
    while waited < 3000 and not worker_alive() do
        sleep_ms(150)
        waited = waited + 150
    end
    return worker_alive()
end

local function ensure_worker()
    if worker_alive() then return true end
    return start_worker()
end

local function safe_id(video_id)
    return (tostring(video_id):gsub('[^%w_%-]', '_'))
end

local function split_lines(text)
    local lines = {}
    for line in tostring(text or ""):gmatch("([^\r\n]+)") do
        lines[#lines + 1] = line
    end
    return lines
end

local function output_excerpt(text)
    local compact = tostring(text or ""):gsub("[%r\n]+", " "):gsub("%s+", " ")
    if #compact > 220 then compact = compact:sub(1, 220).. "..." end
    return compact
end

local function is_stale_batch_req_error(output)
    local lower = tostring(output or ""):lower()
    return lower:find("batch file", 1, true) ~= nil
        and lower:find(".req", 1, true) ~= nil
        and lower:find("could not be read", 1, true) ~= nil
end

local function request_ytdlp_output(input)
    local id = safe_id(input):sub(1, 80).. '_'.. tostring(os.time()).. '_'.. tostring(math.random(100000, 999999))
    local req = QUEUE_DIR.. "\\".. id.. ".req"
    local tmp = req.. ".tmp"
    local resp = QUEUE_DIR.. "\\".. id.. ".resp"
    pcall(os.remove, req)
    pcall(os.remove, tmp)
    pcall(os.remove, resp)
    pcall(os.remove, QUEUE_DIR.. "\\".. id.. ".out")
    pcall(os.remove, QUEUE_DIR.. "\\".. id.. ".err")
    local f = io.open(tmp, "wb")
    if not f then return nil, "request_open_failed" end
    f:write(input.. "\n")
    f:close()
    if not os.rename(tmp, req) then return nil, "request_rename_failed" end
    local waited = 0
    while waited < 35000 and not file_exists(resp) do
        sleep_ms(150)
        waited = waited + 150
    end
    if not file_exists(resp) then return nil, "yt_dlp_timeout" end
    local output = read_file(resp) or ""
    pcall(os.remove, resp)
    return output, nil
end

local function parse_ytdlp_output(output)
    local lines = split_lines(output)
    local url
    local video_id = ""
    local title = ""
    for _, line in ipairs(lines) do
        if line:find("^https?://") then
            url = line
            break
        elseif line:match("^[%w_-]+$") and #line == 11 then
            video_id = line
        elseif title == "" then
            title = line
        end
    end
    if url then
        return {
            url = url,
            video_id = video_id,
            title = title,
        }
    end
    return nil
end

local function restart_worker()
    write_file(WORKER_VERSION_FILE, "restart-".. tostring(os.time()))
    if file_exists(WORKER_ALIVE) then pcall(os.remove, WORKER_ALIVE) end
    sleep_ms(500)
    return start_worker()
end

local function resolve_via_ytdlp(input)
    if not ytdlp_present() then return nil, "ytdlp_not_installed" end
    for attempt = 1, 2 do
        if not ensure_worker() then return nil, "worker_not_alive" end
        local output, err = request_ytdlp_output(input)
        if not output then return nil, err end
        local parsed = parse_ytdlp_output(output)
        if parsed then return parsed, nil end
        if attempt == 1 and (output == "" or is_stale_batch_req_error(output)) then
            logger:warn("yt-dlp worker returned empty/stale output; restarting worker")
            restart_worker()
        else
            logger:warn("yt-dlp output had no playable URL: ".. output_excerpt(output))
            return nil, "bad_ytdlp_output"
        end
    end
    return nil, "bad_ytdlp_output"
end

local function resolve_audio(game_name)
    if type(game_name) ~= "string" or game_name == "" then return nil end
    local query = game_name.. (settings.search_suffix or "")
    logger:info("resolve_audio: ".. query)
    local result, err = resolve_via_ytdlp("ytsearch1:".. query)
    if not result then
        logger:warn("yt-dlp search failed: ".. tostring(err))
        return nil
    end
    return { url = result.url, video_id = result.video_id, title = result.title, source = "yt-dlp-search" }
end

function get_theme_audio(app_id, force_refresh, game_name)
    local ok, result = pcall(function()
        if not ytdlp_present() then return json.encode({ ok = false, error = "ytdlp_not_installed" }) end
        if not game_name or game_name == "" then return json.encode({ ok = false, error = "missing_game_name" }) end
        local key = tostring(app_id)
        local ttl = tonumber(settings.cache_ttl_seconds) or 10800
        if not force_refresh and cache[key] and cache[key].url and ((os.time() - (cache[key].ts or 0)) < ttl) then
            local e = cache[key]
            return json.encode({ ok = true, url = e.url, title = e.title, video_id = e.video_id, cached = true })
        end
        local r = resolve_audio(game_name)
        if not r then return json.encode({ ok = false, error = "not_found" }) end
        cache[key] = { url = r.url, video_id = r.video_id, title = r.title, source = r.source, ts = os.time() }
        save_cache()
        return json.encode({ ok = true, url = r.url, title = r.title, video_id = r.video_id, cached = false })
    end)
    if not ok then logger:warn("get_theme_audio crashed: ".. tostring(result)); return json.encode({ ok = false, error = "internal_error" }) end
    return result
end

function invalidate_audio(app_id)
    cache[tostring(app_id)] = nil
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

function welcome_get_state()
    return json.encode({ ok = true, ytdlp_present = ytdlp_present(), ytdlp_size = file_size(YTDLP_PATH) })
end

function log_frontend(message)
    logger:info("[frontend] ".. tostring(message))
    return json.encode({ ok = true })
end

local function on_load()
    load_state()
    millennium.ready()
    stop_existing_worker()
    logger:info("Game Theme Song loaded in lazy hidden-worker mode")
end

local function on_unload()
    save_cache()
    save_settings()
end

return { on_load = on_load, on_unload = on_unload }
