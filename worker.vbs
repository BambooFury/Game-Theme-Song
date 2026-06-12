Option Explicit

Dim shell, fso
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

If WScript.Arguments.Count > 0 Then
    If LCase(WScript.Arguments(0)) = "--detach" Then
        If WScript.Arguments.Count < 5 Then WScript.Quit 1
        Dim cmd, i, q
        q = Chr(34)
        cmd = q & "wscript.exe" & q & " //nologo //B " & q & WScript.ScriptFullName & q
        For i = 1 To WScript.Arguments.Count - 1
            cmd = cmd & " " & q & WScript.Arguments(i) & q
        Next
        shell.Run cmd, 0, False
        WScript.Quit 0
    End If
End If

Sub WriteFlag(path, msg)
    On Error Resume Next
    Dim f
    Set f = fso.CreateTextFile(path, True)
    f.Write msg
    f.Close
End Sub

If WScript.Arguments.Count < 4 Then WScript.Quit 1

Dim ytdlpPath, queueDir, aliveFile, myVersion, versionFile
ytdlpPath = WScript.Arguments(0)
queueDir = WScript.Arguments(1)
aliveFile = WScript.Arguments(2)
myVersion = WScript.Arguments(3)
versionFile = queueDir & "\worker.expected_version"

Sub TouchAlive()
    On Error Resume Next
    Dim f
    Set f = fso.CreateTextFile(aliveFile, True)
    f.WriteLine Now()
    f.Close
End Sub

Function VersionMismatch()
    On Error Resume Next
    VersionMismatch = False
    If fso.FileExists(versionFile) Then
        Dim f, v
        Set f = fso.OpenTextFile(versionFile, 1)
        v = f.ReadLine()
        f.Close
        If v <> myVersion Then VersionMismatch = True
    End If
End Function

Function ReadAllText(path)
    On Error Resume Next
    ReadAllText = ""
    If Not fso.FileExists(path) Then Exit Function
    Dim f
    Set f = fso.OpenTextFile(path, 1)
    ReadAllText = f.ReadAll()
    f.Close
End Function

' ФИКС БАГА 2: запускаем cmd.exe скрыто (стиль окна 0) и редиректим вывод
' yt-dlp прямо средствами cmd в файлы.out /.err. Без хрупкой Start-Process строки,
' из-за которой раньше.out/.err оставались пустыми.
Sub RunHiddenToFiles(commandLine, stdoutPath, stderrPath, timeoutMs)
    On Error Resume Next
    Dim q, full
    q = Chr(34)

    ' cmd /c "<команда> > "out" 2> "err""
    ' Внешние кавычки cmd снимет сам; внутренние кавычки путей задаём через q & q.
    full = "cmd.exe /c " & q & _
           commandLine & " > " & q & q & stdoutPath & q & q & _
           " 2> " & q & q & stderrPath & q & q & q

    ' intWindowStyle = 0 -> окно скрыто (нет мигания cmd)
    ' bWaitOnReturn = True -> ждём завершения
    shell.Run full, 0, True

    If Err.Number <> 0 Then
        WriteFlag stderrPath, "ERROR: runner failed: " & Err.Description
        Err.Clear
    End If
End Sub

Sub ProcessRequest(reqPath)
    On Error Resume Next
    Dim basePath, respPath, outPath, errPath, reqF, videoInput
    basePath = Left(reqPath, Len(reqPath) - 4)
    respPath = basePath & ".resp"
    outPath = basePath & ".out"
    errPath = basePath & ".err"
    Set reqF = fso.OpenTextFile(reqPath, 1)
    videoInput = reqF.ReadLine()
    reqF.Close
    If Len(videoInput) = 0 Then Exit Sub
    If fso.FileExists(outPath) Then fso.DeleteFile outPath, True
    If fso.FileExists(errPath) Then fso.DeleteFile errPath, True

    Dim q, ytdlpCmd, output, errOutput, safeInput
    q = Chr(34)
    safeInput = Replace(videoInput, q, "'")

    ' ФИКС БАГА 2: используем --print id/title/urls вместо deprecated --get-url,
    ' который в новых версиях yt-dlp часто отдаёт пусто.
    ytdlpCmd = q & ytdlpPath & q & _
        " --ignore-config --no-warnings --no-playlist --socket-timeout 12 --format " & q & "bestaudio[ext=m4a]/bestaudio/best" & q & _
        " --print id --print title --print urls" & _
        " " & q & safeInput & q

    RunHiddenToFiles ytdlpCmd, outPath, errPath, 35000

    output = ReadAllText(outPath)
    errOutput = ReadAllText(errPath)
    If Len(output) = 0 Then output = errOutput

    Dim respF
    Set respF = fso.CreateTextFile(respPath, True)
    respF.Write output
    respF.Close
    If fso.FileExists(reqPath) Then fso.DeleteFile reqPath, True
    If fso.FileExists(outPath) Then fso.DeleteFile outPath, True
    If fso.FileExists(errPath) Then fso.DeleteFile errPath, True
End Sub

If Not fso.FolderExists(queueDir) Then fso.CreateFolder(queueDir)

Do While True
    If VersionMismatch() Then Exit Do
    TouchAlive

    If fso.FolderExists(queueDir) Then
        Dim folder, file
        Set folder = fso.GetFolder(queueDir)
        For Each file In folder.Files
            If LCase(Right(file.Name, 4)) = ".req" Then
                ProcessRequest file.Path
            End If
        Next
    End If

    WScript.Sleep 200
Loop

On Error Resume Next
If fso.FileExists(aliveFile) Then fso.DeleteFile aliveFile, True
WScript.Quit 0
