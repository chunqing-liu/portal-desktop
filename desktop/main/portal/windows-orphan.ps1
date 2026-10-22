# $operation and $portalProfile are supplied only by the main process.
$recordPath = Join-Path $portalProfile 'portal-foreground.json'
$statusPath = Join-Path $portalProfile '.portal-connection-status.json'
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
function Get-Orphan {
  if (-not (Test-Path -LiteralPath $recordPath)) { return }
  $record = Get-Content -LiteralPath $recordPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($record.schema -ne 1 -or $record.pid -le 0 -or $record.parentPid -le 0 -or
      -not $record.nonce -or -not $record.identity -or $record.before -le 0 -or $record.after -lt $record.before -or
      ($record.after - $record.before) -gt 30000 -or
      -not [IO.Path]::IsPathRooted($record.binary) -or -not [IO.Path]::IsPathRooted($record.config)) { throw 'Invalid foreground Portal record' }
  $item = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$record.pid)"
  if (-not $item -or $item.ExecutablePath -ne $record.binary -or $item.ParentProcessId -ne $record.parentPid) { return }
  try { $owner = Invoke-CimMethod -InputObject $item -MethodName GetOwnerSid }
  catch { if ($_.FullyQualifiedErrorId -match '^HRESULT 0x80041002,') { return }; throw }
  if ($owner.Sid -ne $sid) { return }
  $created = ([DateTimeOffset]$item.CreationDate.ToUniversalTime()).ToUnixTimeMilliseconds()
  if ($created -lt $record.before -or $created -gt $record.after) { return }
  # Windows retains the original parent PID after exit; a newer process with
  # that recycled PID is not the original owner.
  $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$record.parentPid)"
  if ($parent -and $parent.CreationDate -le $item.CreationDate) { return }
  # The client can crash before the first status write. The saved birth window,
  # executable and parent still identify that launch; never require readiness
  # to recover it. A status for this PID, when present, must match its nonce.
  if (Test-Path -LiteralPath $statusPath) {
    $status = Get-Content -LiteralPath $statusPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($status.pid -eq $record.pid -and $status.nonce -cne $record.nonce) { return }
  }
  $value = @($record, $item.ExecutablePath, $item.CommandLine, $item.CreationDate.ToUniversalTime().Ticks.ToString(), $sid) | ConvertTo-Json -Depth 8 -Compress
  $hash = [Security.Cryptography.SHA256]::Create()
  try { $proof = ([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($value)))).Replace('-', '').ToLowerInvariant() }
  finally { $hash.Dispose() }
  return @{ item=$item; record=$record; proof=$proof }
}
$entry = Get-Orphan
if ($operation -eq 'inspect') {
  if (-not $entry) { Write-Output 'null'; return }
  @{ pid=[int]$entry.item.ProcessId; binary=$entry.item.ExecutablePath; identity=$entry.record.identity; proof=$entry.proof } | ConvertTo-Json -Compress
} elseif ($operation -eq 'stop') {
  if (-not $entry) { throw 'Portal recovery identity is no longer verifiable' }
  if ($entry.proof -cne $expectedProof) { throw 'Portal recovery identity changed' }
  $process = Get-Process -Id $entry.item.ProcessId -ErrorAction Stop
  try {
    # Retain the native handle while checking identity and stopping the tree,
    # so the process object/PID cannot be recycled during taskkill.
    $null = $process.Handle
    if ([Math]::Abs(($process.StartTime.ToUniversalTime() - $entry.item.CreationDate.ToUniversalTime()).TotalMilliseconds) -ge 1) { throw 'Portal PID was reused' }
    $current = Get-Orphan
    if (-not $current -or $current.proof -cne $expectedProof) { throw 'Portal recovery identity changed before stop' }
    & "$env:SystemRoot\System32\taskkill.exe" /PID $entry.item.ProcessId /T /F | Out-Null
    if ($LASTEXITCODE -ne 0 -and -not $process.HasExited) { throw 'Orphan Portal process tree did not stop' }
    if (-not $process.WaitForExit(12000)) { throw 'Orphan Portal did not exit' }
  } finally { $process.Dispose() }
} else { throw 'Invalid orphan recovery operation' }
