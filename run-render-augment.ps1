$jobId = "job-augment-us-retailers-2fd9986ee5"
$logPath = "C:\Users\boomg\Duply\render-augment.log"
$jobUrl = "https://duply-backend-835k.onrender.com/admin/jobs/$jobId"
$maxStepsPerRun = 1

while ($true) {
  try {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $result = curl.exe --noproxy "*" --connect-timeout 30 --max-time 120 -sS -X POST "$jobUrl/run" -H "Content-Type: application/json" --data-binary "{""maxSteps"":$maxStepsPerRun}" 2>&1
    "[$timestamp] $result" | Tee-Object -FilePath $logPath -Append
    $trimmed = ($result | Out-String).Trim()
    if (-not $trimmed.StartsWith("{")) {
      Start-Sleep -Seconds 20
      continue
    }
    $parsed = $trimmed | ConvertFrom-Json
    if ($parsed.status -eq "completed" -or $parsed.status -eq "failed") {
      break
    }
  } catch {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$timestamp] ERROR: $($_.Exception.Message)" | Tee-Object -FilePath $logPath -Append
  }
  Start-Sleep -Seconds 20
}
