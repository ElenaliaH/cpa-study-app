[CmdletBinding()]
param(
  [string]$DataPath = (Join-Path $PSScriptRoot '..\work\tax-bank\tax-question-bank.publishable.json'),
  [int]$BatchSize = 100,
  [switch]$Apply
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Send-UpsertBatch {
  param(
    [string]$Table,
    [object[]]$Rows,
    [string]$ConflictColumn,
    [hashtable]$Headers,
    [string]$BaseUrl
  )

  if ($Rows.Count -eq 0) {
    return
  }

  $uri = $BaseUrl.TrimEnd('/') + '/rest/v1/' + $Table + '?on_conflict=' + $ConflictColumn
  $request = @{
    Method = 'Post'
    Uri = $uri
    Headers = $Headers
    ContentType = 'application/json; charset=utf-8'
    Body = ($Rows | ConvertTo-Json -Depth 12 -Compress)
  }
  Invoke-RestMethod @request | Out-Null
}

$resolvedDataPath = [System.IO.Path]::GetFullPath($DataPath)
if (-not [System.IO.File]::Exists($resolvedDataPath)) {
  throw "Publishable question bank not found: $resolvedDataPath"
}

$data = Get-Content -LiteralPath $resolvedDataPath -Raw -Encoding UTF8 | ConvertFrom-Json
$chapters = @($data.chapters)
$questions = @($data.questions)

if ($chapters.Count -eq 0 -or $questions.Count -eq 0) {
  throw 'The publishable question bank is empty.'
}
if (@($questions.id | Select-Object -Unique).Count -ne $questions.Count) {
  throw 'Duplicate question IDs were found. Import aborted.'
}
if (@($questions | Where-Object { $_.needsReview }).Count -gt 0) {
  throw 'The publishable file contains questions marked needsReview. Import aborted.'
}

Write-Output "Validated $($chapters.Count) chapters and $($questions.Count) publishable questions."
if (-not $Apply) {
  Write-Output 'Dry run complete. Add -Apply only after the database migration has been reviewed and executed.'
  exit 0
}

$supabaseUrl = [Environment]::GetEnvironmentVariable('SUPABASE_URL')
$serviceRoleKey = [Environment]::GetEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY')
if ([string]::IsNullOrWhiteSpace($supabaseUrl)) {
  throw 'SUPABASE_URL is not configured in the current process environment.'
}
if ([string]::IsNullOrWhiteSpace($serviceRoleKey)) {
  throw 'SUPABASE_SERVICE_ROLE_KEY is not configured in the current process environment.'
}

$headers = @{
  apikey = $serviceRoleKey
  Authorization = 'Bearer ' + $serviceRoleKey
  Prefer = 'resolution=merge-duplicates,return=minimal'
}

$chapterRows = @(
  foreach ($chapter in $chapters) {
    [ordered]@{
      id = $chapter.id
      order_no = [int]$chapter.order
      title = $chapter.title
      question_count = [int]$chapter.questionCount
      objective_question_count = [int]$chapter.questionCount
      source_version = 'wang-tingxi-word-v1'
      is_published = $true
    }
  }
)
Send-UpsertBatch 'tax_chapters' $chapterRows 'id' $headers $supabaseUrl
Write-Output "Upserted $($chapterRows.Count) chapters."

$questionRows = @(
  foreach ($question in $questions) {
    [ordered]@{
      id = $question.id
      chapter_id = $question.chapterId
      sequence_no = [int]$question.sequenceNo
      question_type = $question.questionType
      source_label = $question.sourceLabel
      stem = $question.stem
      options = @($question.options)
      correct_answer = @($question.correctAnswer)
      answer_raw = $question.answerRaw
      explanation = $question.explanation
      content_hash = $question.contentHash
      source_paragraph = [int]$question.sourceParagraph
      source_version = 'wang-tingxi-word-v1'
      is_published = $true
    }
  }
)

$BatchSize = [Math]::Max(10, [Math]::Min($BatchSize, 500))
for ($offset = 0; $offset -lt $questionRows.Count; $offset += $BatchSize) {
  $end = [Math]::Min($offset + $BatchSize - 1, $questionRows.Count - 1)
  $batch = @($questionRows[$offset..$end])
  Send-UpsertBatch 'tax_questions' $batch 'id' $headers $supabaseUrl
  Write-Output "Upserted questions $($offset + 1)-$($end + 1) of $($questionRows.Count)."
}

foreach ($chapter in $chapters) {
  $chapterId = [Uri]::EscapeDataString($chapter.id)
  $countUri = $supabaseUrl.TrimEnd('/') + '/rest/v1/tax_questions?chapter_id=eq.' + $chapterId +
    '&is_published=eq.true&select=id,question_type&limit=1000'
  $published = @(Invoke-RestMethod -Method Get -Uri $countUri -Headers $headers)
  $subjectiveCount = @($published | Where-Object {
    $_.question_type -in @('subjective', 'calculation', 'comprehensive')
  }).Count
  $objectiveCount = $published.Count - $subjectiveCount
  $chapterUri = $supabaseUrl.TrimEnd('/') + '/rest/v1/tax_chapters?id=eq.' + $chapterId
  $body = @{
    question_count = $published.Count
    objective_question_count = $objectiveCount
    subjective_question_count = $subjectiveCount
  } | ConvertTo-Json -Compress
  Invoke-RestMethod -Method Patch -Uri $chapterUri -Headers $headers -ContentType 'application/json' -Body $body | Out-Null
}

Write-Output 'Tax question-bank import completed. No existing rows were deleted.'
