[CmdletBinding()]
param(
  [string]$SourcePath = (Join-Path $PSScriptRoot '..\题库来源\核心·母题精研班-王亭喜(笔记版)(Word笔记版).docx'),
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\work\tax-bank'),
  [int]$MaxIssueSamples = 80
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$NewLine = [Environment]::NewLine

function Normalize-Text {
  param([AllowEmptyString()][string]$Text)
  if ($null -eq $Text) { return '' }
  return ($Text -replace [char]0x00A0, ' ').Trim()
}

function Get-NodeText {
  param(
    [System.Xml.XmlNode]$Node,
    [System.Xml.XmlNamespaceManager]$NamespaceManager
  )

  $parts = [System.Collections.Generic.List[string]]::new()
  foreach ($part in $Node.SelectNodes('.//w:t | .//w:tab | .//w:br', $NamespaceManager)) {
    if ($part.LocalName -eq 't') { $parts.Add($part.InnerText) }
    elseif ($part.LocalName -eq 'tab') { $parts.Add([string][char]9) }
    elseif ($part.LocalName -eq 'br') { $parts.Add($NewLine) }
  }
  return Normalize-Text (-join $parts)
}

function Get-TableText {
  param(
    [System.Xml.XmlNode]$Node,
    [System.Xml.XmlNamespaceManager]$NamespaceManager
  )

  $rows = [Collections.Generic.List[string]]::new()
  foreach ($row in $Node.SelectNodes('./w:tr', $NamespaceManager)) {
    $cells = [Collections.Generic.List[string]]::new()
    foreach ($cell in $row.SelectNodes('./w:tc', $NamespaceManager)) {
      $cellText = (Get-NodeText $cell $NamespaceManager) -replace '\s+', ' '
      $cells.Add($cellText) | Out-Null
    }
    if (@($cells | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }).Count -gt 0) {
      $rows.Add('| ' + ($cells -join ' | ') + ' |') | Out-Null
    }
  }
  return ($rows -join $NewLine).Trim()
}

function Convert-TopicNumber {
  param([string]$ChineseNumber)
  $map = @{
    '一' = 1; '二' = 2; '三' = 3; '四' = 4; '五' = 5; '六' = 6; '七' = 7
    '八' = 8; '九' = 9; '十' = 10; '十一' = 11; '十二' = 12; '十三' = 13; '十四' = 14
  }
  if ($map.ContainsKey($ChineseNumber)) { return $map[$ChineseNumber] }
  return 0
}

function Get-Sha256 {
  param([string]$Text)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([BitConverter]::ToString(
      $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text))
    ) -replace '-', '').ToLowerInvariant()
  }
  finally { $sha.Dispose() }
}

function Write-Utf8File {
  param([string]$Path, [string]$Content)
  [IO.File]::WriteAllText($Path, $Content, [Text.UTF8Encoding]::new($false))
}

function Test-QuestionLead {
  param([string]$Text)
  return (Normalize-Text $Text) -match '^(?:经典母题|母题变形|计算问答题|综合题|案例分析题)'
}

function Get-CleanLead {
  param([string]$Text)
  $value = Normalize-Text $Text
  $duplicate = [regex]::Match(
    $value,
    '^(?<label>(?:经典母题|母题变形|计算问答题|综合题|案例分析题)\s*\d*(?:[-—]\d+)?)\s*\k<label>'
  )
  if ($duplicate.Success) {
    $value = $value.Substring($duplicate.Groups['label'].Length).Trim()
  }
  $match = [regex]::Match(
    $value,
    '^(?<label>(?:经典母题|母题变形|计算问答题|综合题|案例分析题)\s*\d*(?:[-—]\d+)?)\s*(?<text>.*)$'
  )
  if (-not $match.Success) {
    return [pscustomobject]@{ Label = ''; Text = $value }
  }
  return [pscustomobject]@{
    Label = ($match.Groups['label'].Value -replace '\s+', '')
    Text = $match.Groups['text'].Value.Trim()
  }
}

function Get-SubjectiveType {
  param([string]$Label, [string]$Stem)
  $source = $Label + ' ' + $Stem
  if ($source -match '综合题') { return 'comprehensive' }
  if ($source -match '计算|计税|税额') { return 'calculation' }
  return 'subjective'
}

$resolvedSource = [IO.Path]::GetFullPath($SourcePath)
$resolvedOutput = [IO.Path]::GetFullPath($OutputDirectory)
if (-not [IO.File]::Exists($resolvedSource)) {
  throw "Source DOCX not found: $resolvedSource"
}
[IO.Directory]::CreateDirectory($resolvedOutput) | Out-Null

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$archive = [IO.Compression.ZipFile]::OpenRead($resolvedSource)
try {
  $entry = $archive.GetEntry('word/document.xml')
  if ($null -eq $entry) { throw 'The DOCX archive does not contain word/document.xml.' }
  $stream = $entry.Open()
  try {
    $settings = [Xml.XmlReaderSettings]::new()
    $settings.DtdProcessing = [Xml.DtdProcessing]::Prohibit
    $reader = [Xml.XmlReader]::Create($stream, $settings)
    try {
      $xml = [Xml.XmlDocument]::new()
      $xml.Load($reader)
    }
    finally { $reader.Dispose() }
  }
  finally { $stream.Dispose() }

  $ns = [Xml.XmlNamespaceManager]::new($xml.NameTable)
  $ns.AddNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')
  $body = $xml.SelectSingleNode('//w:body', $ns)
  if ($null -eq $body) { throw 'The DOCX document body could not be read.' }

  $paragraphs = [Collections.Generic.List[object]]::new()
  $tables = [Collections.Generic.List[object]]::new()
  $paragraphNumber = 0
  $bodyIndex = -1
  foreach ($node in $body.ChildNodes) {
    $bodyIndex++
    if ($node.LocalName -eq 'p') {
      $paragraphNumber++
      $paragraphs.Add([pscustomobject]@{
        number = $paragraphNumber
        bodyIndex = $bodyIndex
        text = Get-NodeText $node $ns
        hasVisual = $null -ne $node.SelectSingleNode('.//w:drawing | .//w:pict', $ns)
      })
    }
    elseif ($node.LocalName -eq 'tbl') {
      $tables.Add([pscustomobject]@{
        bodyIndex = $bodyIndex
        text = Get-TableText $node $ns
        hasVisual = $null -ne $node.SelectSingleNode('.//w:drawing | .//w:pict', $ns)
      })
    }
  }

  $chapters = [Collections.Generic.List[object]]::new()
  foreach ($paragraph in $paragraphs) {
    $match = [regex]::Match(
      $paragraph.text,
      '^专题(?<number>十四|十三|十二|十一|十|九|八|七|六|五|四|三|二|一)[\s　]*(?<title>.+)$'
    )
    if ($match.Success) {
      $number = Convert-TopicNumber $match.Groups['number'].Value
      $chapters.Add([pscustomobject]@{
        id = ('tax-topic-{0:d2}' -f $number)
        order = $number
        title = $match.Groups['title'].Value.Trim()
        sourceParagraph = $paragraph.number
      })
    }
  }

  $answerIndexes = @(
    for ($index = 0; $index -lt $paragraphs.Count; $index++) {
      if ($paragraphs[$index].text -match '【答案及解析】') { $index }
    }
  )
  $questions = [Collections.Generic.List[object]]::new()

  foreach ($answerIndex in $answerIndexes) {
    $answerParagraph = $paragraphs[$answerIndex]
    $chapter = $null
    foreach ($candidateChapter in $chapters) {
      if ($candidateChapter.sourceParagraph -le $answerParagraph.number) { $chapter = $candidateChapter }
      else { break }
    }

    $leadIndex = -1
    for ($scan = $answerIndex - 1; $scan -ge 0; $scan--) {
      $line = $paragraphs[$scan].text
      if (Test-QuestionLead $line) { $leadIndex = $scan; break }
      if ($line -match '^专题|【答案及解析】') { break }
    }

    $issues = [Collections.Generic.List[string]]::new()
    if ($leadIndex -lt 0) { $issues.Add('missing_question_lead') }
    elseif ($answerIndex - $leadIndex -gt 50) { $issues.Add('question_block_too_long') }

    $sourceLabel = ''
    $stemLines = [Collections.Generic.List[string]]::new()
    if ($leadIndex -ge 0) {
      for ($scan = $leadIndex; $scan -lt $answerIndex; $scan++) {
        $line = Normalize-Text $paragraphs[$scan].text
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        if ($line -match '^\s*【答案】|^\s*【解析】') {
          if ('embedded_objective_answer_marker' -notin $issues) {
            $issues.Add('embedded_objective_answer_marker')
          }
        }
        if ($scan -eq $leadIndex) {
          $lead = Get-CleanLead $line
          $sourceLabel = $lead.Label
          $line = $lead.Text
        }
        if (-not [string]::IsNullOrWhiteSpace($line)) { $stemLines.Add($line) }
      }
    }
    if ($leadIndex -ge 0) {
      $stemTables = @($tables | Where-Object {
        $_.bodyIndex -gt $paragraphs[$leadIndex].bodyIndex -and
        $_.bodyIndex -lt $answerParagraph.bodyIndex -and
        -not [string]::IsNullOrWhiteSpace($_.text)
      })
      foreach ($table in $stemTables) {
        $stemLines.Add('【题目表格】' + $NewLine + $table.text)
      }
    }
    $stem = ($stemLines -join $NewLine).Trim()

    $answerEnd = $paragraphs.Count
    for ($scan = $answerIndex + 1; $scan -lt $paragraphs.Count; $scan++) {
      $line = Normalize-Text $paragraphs[$scan].text
      if (
        (Test-QuestionLead $line) -or
        $line -match '^专题|^\s*【子题】|^\s*【考点|^\s*(?:单选|多选)\s*\d*'
      ) {
        $answerEnd = $scan
        break
      }
    }

    $answerLines = [Collections.Generic.List[string]]::new()
    $firstAnswer = ($answerParagraph.text -replace '^.*?【答案及解析】\s*', '').Trim()
    if (-not [string]::IsNullOrWhiteSpace($firstAnswer)) { $answerLines.Add($firstAnswer) }
    for ($scan = $answerIndex + 1; $scan -lt $answerEnd; $scan++) {
      $line = Normalize-Text $paragraphs[$scan].text
      if (-not [string]::IsNullOrWhiteSpace($line)) { $answerLines.Add($line) }
    }
    $answerEndBodyIndex = if ($answerEnd -lt $paragraphs.Count) {
      $paragraphs[$answerEnd].bodyIndex
    } else {
      [int]::MaxValue
    }
    $answerTables = @($tables | Where-Object {
      $_.bodyIndex -gt $answerParagraph.bodyIndex -and
      $_.bodyIndex -lt $answerEndBodyIndex -and
      -not [string]::IsNullOrWhiteSpace($_.text)
    })
    foreach ($table in $answerTables) {
      $answerLines.Add('【答案表格】' + $NewLine + $table.text)
    }
    $explanation = ($answerLines -join $NewLine).Trim()

    if ([string]::IsNullOrWhiteSpace($stem) -or $stem.Length -lt 20) { $issues.Add('missing_or_short_stem') }
    if ([string]::IsNullOrWhiteSpace($explanation) -or $explanation.Length -lt 20) {
      $issues.Add('missing_or_short_original_answer')
    }
    if ($null -eq $chapter) { $issues.Add('missing_chapter') }

    if ($leadIndex -ge 0) {
      $blockStart = $paragraphs[$leadIndex].bodyIndex
      $blockEnd = if ($answerEnd -lt $paragraphs.Count) {
        $paragraphs[$answerEnd].bodyIndex
      } else {
        [int]::MaxValue
      }
      $unreadableTables = @($tables | Where-Object {
        $_.bodyIndex -gt $blockStart -and $_.bodyIndex -lt $blockEnd -and
        [string]::IsNullOrWhiteSpace($_.text)
      })
      if ($unreadableTables.Count -gt 0) {
        $issues.Add('table_dependent_content')
      }
      if (@($paragraphs[$leadIndex..([Math]::Min($answerEnd - 1, $paragraphs.Count - 1))] |
          Where-Object { $_.hasVisual -and [string]::IsNullOrWhiteSpace($_.text) }).Count -gt 0) {
        $issues.Add('visual_only_content')
      }
    }

    $chapterId = if ($null -ne $chapter) { $chapter.id } else { $null }
    $idChapter = if ($chapterId) { $chapterId } else { 'unassigned' }
    $questionType = Get-SubjectiveType $sourceLabel $stem
    $questions.Add([pscustomobject]@{
      id = ('{0}-subjective-p{1:d5}' -f $idChapter, $answerParagraph.number)
      chapterId = $chapterId
      sourceParagraph = $answerParagraph.number
      sourceLabel = $sourceLabel
      questionType = $questionType
      stem = $stem
      options = @()
      correctAnswer = @()
      answerRaw = ''
      explanation = $explanation
      contentHash = Get-Sha256 ($stem + $NewLine + $explanation)
      needsReview = $issues.Count -gt 0
      issues = $issues.ToArray()
    })
  }

  foreach ($group in @($questions | Group-Object contentHash | Where-Object { $_.Count -gt 1 })) {
    foreach ($question in $group.Group) {
      $question.issues = @($question.issues) + 'duplicate_subjective_content'
      $question.needsReview = $true
    }
  }

  $publishable = @($questions | Where-Object { -not $_.needsReview })
  foreach ($chapter in $chapters) {
    $sequence = 0
    foreach ($question in @($publishable | Where-Object { $_.chapterId -eq $chapter.id })) {
      $sequence++
      $question | Add-Member -NotePropertyName sequenceNo -NotePropertyValue $sequence -Force
    }
    $chapter | Add-Member -NotePropertyName subjectiveQuestionCount -NotePropertyValue $sequence -Force
  }

  $candidate = [ordered]@{
    metadata = [ordered]@{
      sourceFile = [IO.Path]::GetFileName($resolvedSource)
      generatedAt = [DateTimeOffset]::Now.ToString('o')
      parserVersion = 1
      combinedAnswerMarkerCount = $answerIndexes.Count
      candidateCount = $questions.Count
      publishableCount = $publishable.Count
      note = 'Only conservative no-risk blocks are publishable. Review excluded blocks against the original Word.'
    }
    chapters = $chapters.ToArray()
    questions = $questions.ToArray()
  }
  Write-Utf8File (Join-Path $resolvedOutput 'tax-subjective-bank.candidate.json') (
    $candidate | ConvertTo-Json -Depth 12
  )

  $publishableResult = [ordered]@{
    metadata = [ordered]@{
      sourceFile = [IO.Path]::GetFileName($resolvedSource)
      generatedAt = [DateTimeOffset]::Now.ToString('o')
      parserVersion = 1
      questionCount = $publishable.Count
      sourceRule = 'Every item is extracted verbatim from the configured private DOCX.'
    }
    chapters = $chapters.ToArray()
    questions = $publishable
  }
  Write-Utf8File (Join-Path $resolvedOutput 'tax-subjective-bank.publishable.json') (
    $publishableResult | ConvertTo-Json -Depth 12
  )

  $issueRows = @(
    foreach ($question in $questions) {
      foreach ($issue in $question.issues) { $issue }
    }
  ) | Group-Object | Sort-Object Count -Descending
  $report = [Collections.Generic.List[string]]::new()
  $report.Add('# 税法主观题离线解析校验报告')
  $report.Add('')
  $report.Add('- 候选题：' + $questions.Count)
  $report.Add('- 保守可发布：' + $publishable.Count)
  $report.Add('- 隔离待复核：' + ($questions.Count - $publishable.Count))
  $report.Add('')
  $report.Add('## 隔离原因')
  $report.Add('')
  $report.Add('| 原因 | 数量 |')
  $report.Add('|---|---:|')
  foreach ($row in $issueRows) { $report.Add("| $($row.Name) | $($row.Count) |") }
  $report.Add('')
  $report.Add('## 待复核样本')
  $report.Add('')
  foreach ($question in @($questions | Where-Object needsReview | Select-Object -First $MaxIssueSamples)) {
    $report.Add('- ' + $question.id + '：' + ($question.issues -join ', '))
  }
  Write-Utf8File (Join-Path $resolvedOutput 'tax-subjective-bank.validation.md') ($report -join $NewLine)

  Write-Output "Parsed $($questions.Count) subjective candidates; $($publishable.Count) passed conservative publishing checks."
}
finally {
  $archive.Dispose()
}
