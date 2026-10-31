# POSR Desktop NSIS hooks — configure store/locale/AI after install.

!macro NSIS_HOOK_POSTINSTALL
  StrCpy $0 "$LOCALAPPDATA\com.posr.desktop"
  CreateDirectory "$0"

  ; Quit a running tray copy so the UI cache is not locked, then drop only
  ; the WebView2 cache. The database and installer-settings.json stay.
  nsExec::ExecToLog 'taskkill /F /IM POSR.exe'
  Pop $4
  RMDir /r "$0\EBWebView"
  FileOpen $3 "$0\refresh-ui" w
  FileClose $3

  ; Locate configure script (bundled as a resource)
  StrCpy $1 ""
  IfFileExists "$INSTDIR\configure-posr.ps1" 0 +2
    StrCpy $1 "$INSTDIR\configure-posr.ps1"
  IfFileExists "$INSTDIR\windows\configure-posr.ps1" 0 +2
    StrCpy $1 "$INSTDIR\windows\configure-posr.ps1"
  IfFileExists "$INSTDIR\resources\windows\configure-posr.ps1" 0 +2
    StrCpy $1 "$INSTDIR\resources\windows\configure-posr.ps1"

  StrCpy $2 ""
  IfFileExists "$INSTDIR\installer-settings.template.json" 0 +2
    StrCpy $2 "$INSTDIR\installer-settings.template.json"
  IfFileExists "$INSTDIR\windows\installer-settings.template.json" 0 +2
    StrCpy $2 "$INSTDIR\windows\installer-settings.template.json"
  IfFileExists "$INSTDIR\resources\windows\installer-settings.template.json" 0 +2
    StrCpy $2 "$INSTDIR\resources\windows\installer-settings.template.json"

  ; An update already has store settings. Do not ask again.
  IfFileExists "$0\installer-settings.json" have_cfg 0
  IfFileExists "$APPDATA\com.posr.desktop\installer-settings.json" have_cfg 0
  IfFileExists "$APPDATA\com.posr.desktop\.posr_setup_done" have_cfg 0
  Goto ask_cfg
  have_cfg:
    DetailPrint "POSR settings already exist, skipping setup."
    Goto skip_cfg
  ask_cfg:

  StrCmp $1 "" skip_cfg 0
  ${IfNot} ${Silent}
    ; nsExec hides the child window, so the WinForms wizard never appears and
    ; the installer sits on "creating com.posr.desktop". ExecWait shows it.
    ; -STA is required or ShowDialog deadlocks.
    DetailPrint "Opening POSR setup..."
    ExecWait '"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -STA -ExecutionPolicy Bypass -File "$1" -AppDataDir "$0"'
  ${Else}
    IfFileExists "$0\installer-settings.json" +3 0
    StrCmp $2 "" +2 0
      CopyFiles /SILENT "$2" "$0\installer-settings.json"
  ${EndIf}
  skip_cfg:
!macroend

!macro NSIS_HOOK_PREINSTALL
!macroend

!macro NSIS_HOOK_PREUNINSTALL
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
!macroend
