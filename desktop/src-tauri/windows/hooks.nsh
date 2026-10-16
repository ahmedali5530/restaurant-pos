# POSR Desktop NSIS hooks — configure store/locale/AI after install.

!macro NSIS_HOOK_POSTINSTALL
  StrCpy $0 "$LOCALAPPDATA\com.posr.desktop"
  CreateDirectory "$0"

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

  StrCmp $1 "" skip_cfg 0
  ${IfNot} ${Silent}
    nsExec::ExecToLog '"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$1" -AppDataDir "$0"'
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
