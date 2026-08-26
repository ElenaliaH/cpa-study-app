[CmdletBinding()]
param(
  [string]$DataPath = (Join-Path $PSScriptRoot '..\work\tax-bank\tax-subjective-bank.publishable.json'),
  [int]$BatchSize = 20,
  [switch]$Publish
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-SupabaseJson {
  param(
    [ValidateSet('GET', 'POST', 'PATCH')][string]$Method,
    [string]$Path,
    [hashtable]$Headers,
    [AllowNull()][object]$Body
  )

  $parameters = @{
    Method = $Method
    Uri = $script:SupabaseUrl + $Path
    Headers = $Headers
    ContentType = 'application/json; charset=utf-8'
  }
  if ($null -ne $Body) {
    $parameters.Body = $Body | ConvertTo-Json -Depth 12 -Compress
  }
  return Invoke-RestMethod @parameters
}

$resolvedDataPath = [IO.Path]::GetFullPath($DataPath)
if (-not [IO.File]::Exists($resolvedDataPath)) {
  throw "Publishable subjective question bank not found: $resolvedDataPath"
}

$script:SupabaseUrl = [string]$env:SUPABASE_URL
$serviceRoleKey = [string]$env:SUPABASE_SERVICE_ROLE_KEY
if ([string]::IsNullOrWhiteSpace($script:SupabaseUrl) -or [string]::IsNullOrWhiteSpace($serviceRoleKey)) {
  throw 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be provided through local environment variables.'
}
$script:SupabaseUrl = $script:SupabaseUrl.TrimEnd('/')
$BatchSize = [Math]::Max(1, [Math]::Min($BatchSize, 100))

$headers = @{
  apikey = $serviceRoleKey
  Authorization = 'Bearer ' + $serviceRoleKey
}
$data = Get-Content -LiteralPath $resolvedDataPath -Raw -Encoding UTF8 | ConvertFrom-Json
$questions = @($data.questions)
if ($questions.Count -eq 0) { throw 'The subjective question bank is empty.' }
if (@($questions.id | Select-Object -Unique).Count -ne $questions.Count) {
  throw 'Duplicate subjective question IDs were found. Import aborted.'
}
if (@($questions | Where-Object { $_.needsReview }).Count -gt 0) {
  throw 'The publishable file contains questions marked needsReview. Import aborted.'
}
foreach ($question in $questions) {
  if ($question.questionType -notin @('subjective', 'calculation', 'comprehensive')) {
    throw "Unsupported subjective question type: $($question.questionType)"
  }
  if ([string]::IsNullOrWhiteSpace($question.stem) -or [string]::IsNullOrWhiteSpace($question.explanation)) {
    throw "Incomplete subjective question: $($question.id)"
  }
}

$rows = [Collections.Generic.List[object]]::new()
foreach ($chapterGroup in @($questions | Group-Object chapterId)) {
  $chapterId = [Uri]::EscapeDataString($chapterGroup.Name)
  $existing = @(
    Invoke-SupabaseJson GET (
      '/rest/v1/tax_questions?chapter_id=eq.' + $chapterId + '&select=id,sequence_no&limit=1000'
    ) $headers $null
  )
  $currentIds = @{}
  foreach ($question in $chapterGroup.Group) { $currentIds[$question.id] = $true }
  $baseMax = 0
  foreach ($row in $existing) {
    if (-not $currentIds.ContainsKey($row.id)) {
      $baseMax = [Math]::Max($baseMax, [int]$row.sequence_no)
    }
  }

  $sequence = 0
  foreach ($question in @($chapterGroup.Group | Sort-Object sourceParagraph)) {
    $sequence++
    $rows.Add([ordered]@{
      id = $question.id
      chapter_id = $question.chapterId
      sequence_no = $baseMax + $sequence
      question_type = $question.questionType
      source_label = $question.sourceLabel
      stem = $question.stem
      options = @()
      correct_answer = @()
      answer_raw = ''
      explanation = $question.explanation
      content_hash = $question.contentHash
      source_paragraph = [int]$question.sourceParagraph
      source_version = 'wang-tingxi-word-v1-subjective-20260826'
      is_published = $Publish.IsPresent
    })
  }
}

$writeHeaders = $headers.Clone()
$writeHeaders.Prefer = 'resolution=merge-duplicates,return=minimal'
for ($offset = 0; $offset -lt $rows.Count; $offset += $BatchSize) {
  $end = [Math]::Min($offset + $BatchSize - 1, $rows.Count - 1)
  $batch = @($rows[$offset..$end])
  Invoke-SupabaseJson POST '/rest/v1/tax_questions?on_conflict=id' $writeHeaders $batch | Out-Null
  Write-Output "Upserted subjective questions $($offset + 1)-$($end + 1) of $($rows.Count)."
}

if ($Publish) {
  foreach ($chapterId in @($questions.chapterId | Select-Object -Unique)) {
    $encoded = [Uri]::EscapeDataString($chapterId)
    $published = @(
      Invoke-SupabaseJson GET (
        '/rest/v1/tax_questions?chapter_id=eq.' + $encoded + '&is_published=eq.true&select=id&limit=1000'
      ) $headers $null
    )
    Invoke-SupabaseJson PATCH (
      '/rest/v1/tax_chapters?id=eq.' + $encoded
    ) $headers @{ question_count = $published.Count } | Out-Null
  }
}

$visibility = if ($Publish) { 'published' } else { 'unpublished staging' }
Write-Output "Subjective import completed: $($rows.Count) rows as $visibility. No rows were deleted."
