' Starts the Image Keeper server with no window. Optional argument: port (default 47614).
Dim sh, fso, here, port, cmd
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
port = ""
If WScript.Arguments.Count > 0 Then port = " " & WScript.Arguments(0)
cmd = "cmd /c """"" & here & "\start-imagekeeper-server.bat""" & port & """"
sh.Run cmd, 0, False
