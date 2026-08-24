[CmdletBinding()]
param(
  [string]$SourcePath = (Join-Path $PSScriptRoot '..\题库来源\核心·母题精研班-王亭喜(笔记版)(Word笔记版).docx'),
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\work\tax-bank'),
  [int]$MaxIssueSamples = 100
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$NewLine = [Environment]::NewLine

function Normalize-Text {
  param([AllowEmptyString()][string]$Text)

  if ($null -eq $Text) {
    return ''
  }
  return ($Text -replace [char]0x00A0, ' ').Trim()
}

function Get-NodeText {
  param(
    [System.Xml.XmlNode]$Node,
    [System.Xml.XmlNamespaceManager]$NamespaceManager
  )

  $parts = [System.Collections.Generic.List[string]]::new()
  foreach ($part in $Node.SelectNodes('.//w:t | .//w:tab | .//w:br', $NamespaceManager)) {
    if ($part.LocalName -eq 't') {
      $parts.Add($part.InnerText)
    }
    elseif ($part.LocalName -eq 'tab') {
      $parts.Add([string][char]9)
    }
    elseif ($part.LocalName -eq 'br') {
      $parts.Add([Environment]::NewLine)
    }
  }
  return Normalize-Text (-join $parts)
}

function Get-QuestionLead {
  param([string]$Text)

  $normalized = Normalize-Text $Text
  $duplicatePattern = '^(?<label>(?:单选|多选|经典母题|母题变形)\s*\d+(?:[-—]\d+)?)\s*\k<label>'
  $duplicateMatch = [regex]::Match($normalized, $duplicatePattern)
  $hadDuplicate = $duplicateMatch.Success
  if ($hadDuplicate) {
    $normalized = $normalized.Substring($duplicateMatch.Groups['label'].Length).Trim()
  }

  $leadMatch = [regex]::Match($normalized, '^(?<label>(?:单选|多选|经典母题|母题变形)\s*\d+(?:[-—]\d+)?)')
  if (-not $leadMatch.Success) {
    return [pscustomobject]@{
      Text = $normalized
      Label = ''
      HadDuplicateLabel = $hadDuplicate
    }
  }

  return [pscustomobject]@{
    Text = $normalized.Substring($leadMatch.Length).Trim()
    Label = ($leadMatch.Groups['label'].Value -replace '\s+', '')
    HadDuplicateLabel = $hadDuplicate
  }
}

function Parse-Option {
  param([string]$Text)

  $match = [regex]::Match((Normalize-Text $Text), '^\s*(?<label>[A-Z])[\.\．、]\s*(?<text>.+)$')
  if (-not $match.Success) {
    return $null
  }

  return [pscustomobject]@{
    label = $match.Groups['label'].Value
    text = $match.Groups['text'].Value.Trim()
  }
}

function Get-QuestionType {
  param(
    [string]$SourceLabel,
    [object[]]$Options,
    [string[]]$AnswerLetters,
    [string]$Stem
  )

  if ($SourceLabel -match '^单选') { return 'single_choice' }
  if ($SourceLabel -match '^多选') { return 'multiple_choice' }
  if ($Options.Count -eq 0 -and $Stem -match '计算|说明|简述|综合题|问答题') {
    return 'calculation_or_comprehensive'
  }
  if ($Options.Count -gt 0 -and $AnswerLetters.Count -eq 1) {
    return 'single_choice_inferred'
  }
  if ($Options.Count -gt 0 -and $AnswerLetters.Count -gt 1) {
    return 'multiple_choice_inferred'
  }
  return 'unknown'
}

function Get-Sha256 {
  param([string]$Text)

  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    return ([System.BitConverter]::ToString($sha.ComputeHash($bytes)) -replace '-', '').ToLowerInvariant()
  }
  finally {
    $sha.Dispose()
  }
}

function Convert-TopicNumber {
  param([string]$ChineseNumber)

  $map = @{
    '一' = 1; '二' = 2; '三' = 3; '四' = 4; '五' = 5; '六' = 6; '七' = 7
    '八' = 8; '九' = 9; '十' = 10; '十一' = 11; '十二' = 12; '十三' = 13; '十四' = 14
  }
  if ($map.ContainsKey($ChineseNumber)) {
    return $map[$ChineseNumber]
  }
  return 0
}

function Write-Utf8File {
  param(
    [string]$Path,
    [string]$Content
  )

  [System.IO.File]::WriteAllText(
    $Path,
    $Content,
    [System.Text.UTF8Encoding]::new($false)
  )
}

$resolvedSource = [System.IO.Path]::GetFullPath($SourcePath)
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
if (-not [System.IO.File]::Exists($resolvedSource)) {
  throw "Source DOCX not found: $resolvedSource"
}

[System.IO.Directory]::CreateDirectory($resolvedOutput) | Out-Null
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$archive = [System.IO.Compression.ZipFile]::OpenRead($resolvedSource)
try {
  $documentEntry = $archive.GetEntry('word/document.xml')
  if ($null -eq $documentEntry) {
    throw 'The DOCX archive does not contain word/document.xml.'
  }

  $settings = [System.Xml.XmlReaderSettings]::new()
  $settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
  $stream = $documentEntry.Open()
  $reader = [System.Xml.XmlReader]::Create($stream, $settings)
  try {
    $xml = [System.Xml.XmlDocument]::new()
    $xml.Load($reader)
  }
  finally {
    $reader.Dispose()
    $stream.Dispose()
  }

  $ns = [System.Xml.XmlNamespaceManager]::new($xml.NameTable)
  $ns.AddNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')

  $body = $xml.SelectSingleNode('//w:body', $ns)
  if ($null -eq $body) {
    throw 'The DOCX document body could not be read.'
  }

  $paragraphs = [System.Collections.Generic.List[object]]::new()
  $tables = [System.Collections.Generic.List[object]]::new()
  $paragraphNumber = 0
  $tableNumber = 0
  $visualParagraphCount = 0

  foreach ($node in $body.ChildNodes) {
    if ($node.LocalName -eq 'p') {
      $paragraphNumber++
      $text = Get-NodeText $node $ns
      $hasVisual = $null -ne $node.SelectSingleNode('.//w:drawing | .//w:pict', $ns)
      if ($hasVisual) {
        $visualParagraphCount++
      }
      $paragraphs.Add([pscustomobject]@{
        number = $paragraphNumber
        text = $text
        hasVisual = $hasVisual
      })
    }
    elseif ($node.LocalName -eq 'tbl') {
      $tableNumber++
      $rows = [System.Collections.Generic.List[object]]::new()
      foreach ($rowNode in $node.SelectNodes('./w:tr', $ns)) {
        $cells = [System.Collections.Generic.List[string]]::new()
        foreach ($cellNode in $rowNode.SelectNodes('./w:tc', $ns)) {
          $cells.Add((Get-NodeText $cellNode $ns))
        }
        $rows.Add($cells.ToArray())
      }
      $tables.Add([pscustomobject]@{
        number = $tableNumber
        rows = $rows.ToArray()
      })
    }
  }

  $chapters = [System.Collections.Generic.List[object]]::new()
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

  $answerIndexes = [System.Collections.Generic.List[int]]::new()
  $combinedBlocks = [System.Collections.Generic.List[object]]::new()
  for ($i = 0; $i -lt $paragraphs.Count; $i++) {
    if ($paragraphs[$i].text -match '^\s*【答案】') {
      $answerIndexes.Add($i)
    }
    if ($paragraphs[$i].text -match '【答案及解析】') {
      $combinedBlocks.Add([pscustomobject]@{
        sourceParagraph = $paragraphs[$i].number
        issue = 'combined_answer_and_explanation_requires_manual_review'
      })
    }
  }

  $questions = [System.Collections.Generic.List[object]]::new()
  for ($answerPosition = 0; $answerPosition -lt $answerIndexes.Count; $answerPosition++) {
    $answerIndex = $answerIndexes[$answerPosition]
    $answerParagraph = $paragraphs[$answerIndex]
    $previousAnswerIndex = if ($answerPosition -gt 0) {
      $answerIndexes[$answerPosition - 1]
    }
    else {
      -1
    }

    $chapter = $null
    foreach ($candidateChapter in $chapters) {
      if ($candidateChapter.sourceParagraph -le $answerParagraph.number) {
        $chapter = $candidateChapter
      }
      else {
        break
      }
    }

    $cursor = $answerIndex - 1
    while ($cursor -gt $previousAnswerIndex -and [string]::IsNullOrWhiteSpace($paragraphs[$cursor].text)) {
      $cursor--
    }

    $optionsReversed = [System.Collections.Generic.List[object]]::new()
    while ($cursor -gt $previousAnswerIndex) {
      $option = Parse-Option $paragraphs[$cursor].text
      if ($null -eq $option) {
        break
      }
      $optionsReversed.Add($option)
      $cursor--
      while ($cursor -gt $previousAnswerIndex -and [string]::IsNullOrWhiteSpace($paragraphs[$cursor].text)) {
        $cursor--
      }
    }

    $options = [System.Collections.Generic.List[object]]::new()
    for ($optionIndex = $optionsReversed.Count - 1; $optionIndex -ge 0; $optionIndex--) {
      $options.Add($optionsReversed[$optionIndex])
    }
    $firstOptionIndex = if ($options.Count -gt 0) { $cursor + 1 } else { $answerIndex }

    $stemStart = -1
    $sourceLabel = ''
    $hadDuplicateLabel = $false
    for ($scan = $firstOptionIndex - 1; $scan -gt $previousAnswerIndex; $scan--) {
      $lead = Get-QuestionLead $paragraphs[$scan].text
      if (-not [string]::IsNullOrWhiteSpace($lead.Label)) {
        $stemStart = $scan
        $sourceLabel = $lead.Label
        $hadDuplicateLabel = $lead.HadDuplicateLabel
        break
      }
      if ($paragraphs[$scan].text -match '^专题') {
        break
      }
    }

    if ($stemStart -lt 0) {
      for ($scan = $firstOptionIndex - 1; $scan -gt $previousAnswerIndex; $scan--) {
        if (-not [string]::IsNullOrWhiteSpace($paragraphs[$scan].text)) {
          $stemStart = $scan
          break
        }
      }
    }

    $stemLines = [System.Collections.Generic.List[string]]::new()
    if ($stemStart -ge 0) {
      for ($scan = $stemStart; $scan -lt $firstOptionIndex; $scan++) {
        if ([string]::IsNullOrWhiteSpace($paragraphs[$scan].text)) {
          continue
        }
        $line = $paragraphs[$scan].text
        if ($scan -eq $stemStart) {
          $line = (Get-QuestionLead $line).Text
        }
        $stemLines.Add($line)
      }
    }
    $stem = ($stemLines -join $NewLine).Trim()

    $answerRaw = ($answerParagraph.text -replace '^\s*【答案】\s*', '').Trim()
    $answerToken = ($answerRaw -split '[；;。\s]')[0].ToUpperInvariant()
    $answerLetters = @(
      [regex]::Matches($answerToken, '[A-Z]') |
        ForEach-Object { $_.Value } |
        Select-Object -Unique
    )

    $analysisIndex = -1
    $lookAheadLimit = [Math]::Min($paragraphs.Count - 1, $answerIndex + 6)
    for ($scan = $answerIndex + 1; $scan -le $lookAheadLimit; $scan++) {
      if ($paragraphs[$scan].text -match '^\s*【解析】') {
        $analysisIndex = $scan
        break
      }
      if ($paragraphs[$scan].text -match '^\s*【答案】|^专题') {
        break
      }
    }

    $explanationLines = [System.Collections.Generic.List[string]]::new()
    if ($analysisIndex -ge 0) {
      $firstLine = ($paragraphs[$analysisIndex].text -replace '^\s*【解析】\s*', '').Trim()
      if (-not [string]::IsNullOrWhiteSpace($firstLine)) {
        $explanationLines.Add($firstLine)
      }

      $analysisLimit = [Math]::Min($paragraphs.Count - 1, $analysisIndex + 40)
      for ($scan = $analysisIndex + 1; $scan -le $analysisLimit; $scan++) {
        $line = $paragraphs[$scan].text
        $lead = Get-QuestionLead $line
        if ($line -match '^\s*【答案】|^专题' -or -not [string]::IsNullOrWhiteSpace($lead.Label)) {
          break
        }
        if (-not [string]::IsNullOrWhiteSpace($line)) {
          $explanationLines.Add($line)
        }
      }
    }
    $explanation = ($explanationLines -join $NewLine).Trim()

    $issues = [System.Collections.Generic.List[string]]::new()
    $warnings = [System.Collections.Generic.List[string]]::new()
    if ([string]::IsNullOrWhiteSpace($stem)) { $issues.Add('missing_stem') }
    if ($options.Count -eq 0) { $issues.Add('no_options_or_subjective_question') }
    if ([string]::IsNullOrWhiteSpace($answerRaw)) { $issues.Add('missing_answer_text') }
    if ([string]::IsNullOrWhiteSpace($explanation)) { $issues.Add('missing_or_nonstandard_explanation') }
    if ($analysisIndex -gt $answerIndex + 1) { $issues.Add('analysis_not_immediately_after_answer') }
    if ($hadDuplicateLabel) { $warnings.Add('duplicated_source_label_text_cleaned') }

    $optionLabels = @($options | ForEach-Object { $_.label })
    if (@($optionLabels | Select-Object -Unique).Count -ne $optionLabels.Count) {
      $issues.Add('duplicate_option_label')
    }
    if ($optionLabels.Count -gt 0) {
      $expectedLabels = @(0..($optionLabels.Count - 1) | ForEach-Object { [string][char]([int][char]'A' + $_) })
      if (($optionLabels -join '') -ne ($expectedLabels -join '')) {
        $issues.Add('nonsequential_option_labels')
      }
    }
    foreach ($letter in $answerLetters) {
      if ($options.Count -gt 0 -and $letter -notin $optionLabels) {
        $issues.Add('answer_letter_missing_from_options')
        break
      }
    }

    $chapterId = if ($null -ne $chapter) { $chapter.id } else { $null }
    $idChapter = if ($null -ne $chapter) { $chapter.id } else { 'unassigned' }
    $sourceId = '{0}-p{1:d5}' -f $idChapter, $answerParagraph.number
    $hashText = $stem + $NewLine + (($options | ForEach-Object { $_.label + ':' + $_.text }) -join $NewLine)

    $questions.Add([pscustomobject]@{
      id = $sourceId
      chapterId = $chapterId
      sourceParagraph = $answerParagraph.number
      sourceLabel = $sourceLabel
      questionType = Get-QuestionType $sourceLabel $options.ToArray() $answerLetters $stem
      stem = $stem
      options = $options.ToArray()
      correctAnswer = $answerLetters
      answerRaw = $answerRaw
      explanation = $explanation
      contentHash = Get-Sha256 $hashText
      needsReview = $issues.Count -gt 0
      issues = $issues.ToArray()
      warnings = $warnings.ToArray()
    })
  }

  $labelGroups = @(
    $questions |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_.sourceLabel) } |
      Group-Object chapterId, sourceLabel |
      Where-Object { $_.Count -gt 1 }
  )
  foreach ($group in $labelGroups) {
    foreach ($question in $group.Group) {
      if ('reused_source_label_in_chapter' -notin $question.warnings) {
        $question.warnings = @($question.warnings) + 'reused_source_label_in_chapter'
      }
    }
  }

  $hashGroups = @(
    $questions |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_.stem) } |
      Group-Object contentHash |
      Where-Object { $_.Count -gt 1 }
  )
  foreach ($group in $hashGroups) {
    foreach ($question in $group.Group) {
      if ('duplicate_question_content' -notin $question.issues) {
        $question.issues = @($question.issues) + 'duplicate_question_content'
        $question.needsReview = $true
      }
    }
  }

  $mediaCount = @($archive.Entries | Where-Object { $_.FullName -like 'word/media/*' }).Count
  $publishableQuestions = @(
    $questions |
      Where-Object {
        -not $_.needsReview -and
        $_.options.Count -ge 2 -and
        $_.correctAnswer.Count -gt 0 -and
        -not [string]::IsNullOrWhiteSpace($_.explanation)
      }
  )

  foreach ($chapter in $chapters) {
    $sequence = 0
    foreach ($question in @($publishableQuestions | Where-Object { $_.chapterId -eq $chapter.id })) {
      $sequence++
      $question | Add-Member -NotePropertyName sequenceNo -NotePropertyValue $sequence -Force
    }
    $chapter | Add-Member -NotePropertyName questionCount -NotePropertyValue $sequence -Force
  }

  $result = [ordered]@{
    metadata = [ordered]@{
      sourceFile = [System.IO.Path]::GetFileName($resolvedSource)
      generatedAt = [DateTimeOffset]::Now.ToString('o')
      parserVersion = 1
      paragraphCount = $paragraphs.Count
      tableCount = $tables.Count
      mediaCount = $mediaCount
      visualParagraphCount = $visualParagraphCount
      answerMarkerCount = $answerIndexes.Count
      combinedAnswerAnalysisCount = $combinedBlocks.Count
      note = 'Candidate extraction only. Manually verify every needsReview question before import.'
    }
    chapters = $chapters.ToArray()
    questions = $questions.ToArray()
    deferredCombinedBlocks = $combinedBlocks.ToArray()
  }

  $jsonPath = Join-Path $resolvedOutput 'tax-question-bank.candidate.json'
  Write-Utf8File $jsonPath ($result | ConvertTo-Json -Depth 12)

  $publishableResult = [ordered]@{
    metadata = [ordered]@{
      sourceFile = [System.IO.Path]::GetFileName($resolvedSource)
      generatedAt = [DateTimeOffset]::Now.ToString('o')
      parserVersion = 1
      questionCount = $publishableQuestions.Count
      sourceRule = 'Every published question is extracted from the configured DOCX source.'
    }
    chapters = $chapters.ToArray()
    questions = $publishableQuestions
  }
  $publishablePath = Join-Path $resolvedOutput 'tax-question-bank.publishable.json'
  Write-Utf8File $publishablePath ($publishableResult | ConvertTo-Json -Depth 12)

  $allIssues = @(
    foreach ($question in $questions) {
      foreach ($issue in $question.issues) {
        $issue
      }
    }
  )
  $allWarnings = @(
    foreach ($question in $questions) {
      foreach ($warning in $question.warnings) {
        $warning
      }
    }
  )
  $issueRows = @($allIssues | Group-Object | Sort-Object Count -Descending)
  $warningRows = @($allWarnings | Group-Object | Sort-Object Count -Descending)
  $typeRows = @($questions | Group-Object questionType | Sort-Object Name)

  $report = [System.Collections.Generic.List[string]]::new()
  $report.Add('# 税法题库离线解析校验报告')
  $report.Add('')
  $report.Add('- 源文件：' + [System.IO.Path]::GetFileName($resolvedSource))
  $report.Add('- 生成时间：' + [DateTimeOffset]::Now.ToString('yyyy-MM-dd HH:mm:ss zzz'))
  $report.Add('- 本报告只反映候选解析结果，不代表题库已经可以导入生产数据库。')
  $report.Add('')
  $report.Add('## 文档结构')
  $report.Add('')
  $report.Add('| 项目 | 数量 |')
  $report.Add('|---|---:|')
  $report.Add("| 正文段落 | $($paragraphs.Count) |")
  $report.Add("| 表格 | $($tables.Count) |")
  $report.Add("| 媒体文件 | $mediaCount |")
  $report.Add("| 含绘图或图片的段落 | $visualParagraphCount |")
  $report.Add("| 专题 | $($chapters.Count) |")
  $report.Add("| 答案候选块 | $($answerIndexes.Count) |")
  $report.Add("| 当前可发布客观题 | $($publishableQuestions.Count) |")
  $report.Add("| 答案及解析待人工处理块 | $($combinedBlocks.Count) |")
  $report.Add('')
  $report.Add('## 各专题候选题目')
  $report.Add('')
  $report.Add('| 顺序 | 专题 | 候选题数 | 需复核 |')
  $report.Add('|---:|---|---:|---:|')
  foreach ($chapter in $chapters) {
    $chapterQuestions = @($questions | Where-Object { $_.chapterId -eq $chapter.id })
    $reviewCount = @($chapterQuestions | Where-Object { $_.needsReview }).Count
    $report.Add("| $($chapter.order) | $($chapter.title) | $($chapterQuestions.Count) | $reviewCount |")
  }
  $unassigned = @($questions | Where-Object { $null -eq $_.chapterId })
  if ($unassigned.Count -gt 0) {
    $unassignedReview = @($unassigned | Where-Object { $_.needsReview }).Count
    $report.Add("| - | 未归类 | $($unassigned.Count) | $unassignedReview |")
  }
  $report.Add('')
  $report.Add('## 题型候选')
  $report.Add('')
  $report.Add('| 类型 | 数量 |')
  $report.Add('|---|---:|')
  foreach ($row in $typeRows) {
    $report.Add("| $($row.Name) | $($row.Count) |")
  }
  $report.Add('')
  $report.Add('## 校验问题')
  $report.Add('')
  $report.Add('| 问题代码 | 数量 |')
  $report.Add('|---|---:|')
  foreach ($row in $issueRows) {
    $report.Add("| $($row.Name) | $($row.Count) |")
  }
  $report.Add("| combined_answer_and_explanation_requires_manual_review | $($combinedBlocks.Count) |")
  $report.Add('')
  $report.Add('## 自动清理或提示')
  $report.Add('')
  $report.Add('| 提示代码 | 数量 |')
  $report.Add('|---|---:|')
  foreach ($row in $warningRows) {
    $report.Add("| $($row.Name) | $($row.Count) |")
  }
  $report.Add('')
  $report.Add('## 需人工复核样本')
  $report.Add('')
  $report.Add('| 候选题 ID | Word 段落 | 问题 |')
  $report.Add('|---|---:|---|')
  $sampleQuestions = @($questions | Where-Object { $_.needsReview } | Select-Object -First $MaxIssueSamples)
  foreach ($question in $sampleQuestions) {
    $report.Add("| $($question.id) | $($question.sourceParagraph) | $($question.issues -join ', ') |")
  }
  $remainingSamples = [Math]::Max(0, $MaxIssueSamples - $sampleQuestions.Count)
  foreach ($block in @($combinedBlocks | Select-Object -First $remainingSamples)) {
    $report.Add("| combined-p$($block.sourceParagraph) | $($block.sourceParagraph) | $($block.issue) |")
  }
  $report.Add('')
  $report.Add('## 当前解析边界')
  $report.Add('')
  $report.Add('- 普通选择题按“题干、连续选项、答案、解析”识别。')
  $report.Add('- 答案及解析合并块、计算问答题、综合题、多小问和表格题保留为待人工处理。')
  $report.Add('- 原答案和原解析只做提取，不由解析器改写或补全。')
  $report.Add('- 正式导入前必须抽查每个专题，并处理全部高风险校验项。')

  $reportPath = Join-Path $resolvedOutput 'tax-question-bank.validation.md'
  Write-Utf8File $reportPath ($report -join $NewLine)

  [pscustomobject]@{
    source = $resolvedSource
    json = $jsonPath
    publishableJson = $publishablePath
    report = $reportPath
    chapters = $chapters.Count
    candidateQuestions = $questions.Count
    publishableQuestions = $publishableQuestions.Count
    reviewQuestions = @($questions | Where-Object { $_.needsReview }).Count
    deferredCombinedBlocks = $combinedBlocks.Count
  } | ConvertTo-Json
}
finally {
  $archive.Dispose()
}
