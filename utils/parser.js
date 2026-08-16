// 通用文本解析器：把任意格式的文本识别成 单选题/多选题/判断题/填空题/解答题
// 兼容：考试系统导出（学习通/豆包等）、Markdown、带题号纯文本、粘贴的表格文本等
const util = require('./util');

/* ---------------- 基础归一化 ---------------- */

function normalizeText(text) {
  if (text == null) return '';
  let s = String(text);
  s = s.replace(/^\uFEFF/, '');
  s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF\uE000-\uF8FF\uFFFD]/g, '');
  s = s.replace(/\r\n?/g, '\n');
  s = s.replace(/\u00A0/g, ' ');
  return s;
}

function stripTags(s) {
  if (/<[a-zA-Z][^>]*>/.test(s)) {
    return s.replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ');
  }
  return s;
}

/* ---------------- 题型关键字 ---------------- */

const TYPE_KEYWORDS = [
  ['不定项选择题', 'multi'], ['不定项选择', 'multi'],
  ['单项选择题', 'single'], ['单选题', 'single'], ['单选', 'single'],
  ['多项选择题', 'multi'], ['多选题', 'multi'], ['多选', 'multi'],
  ['判断题', 'judge'], ['判断', 'judge'],
  ['填空题', 'fill'], ['填空', 'fill'],
  ['简答题', 'short'], ['解答题', 'short'], ['论述题', 'short'],
  ['问答题', 'short'], ['名词解释题', 'short'], ['案例分析题', 'short'],
  ['简答', 'short'], ['解答', 'short'], ['论述', 'short'],
  ['问答', 'short'], ['名词解释', 'short'], ['案例分析', 'short']
].sort((a, b) => b[0].length - a[0].length);

const KW = TYPE_KEYWORDS.map(t => t[0]).join('|');

function mapType(word) {
  for (let i = 0; i < TYPE_KEYWORDS.length; i++) {
    if (word.indexOf(TYPE_KEYWORDS[i][0]) >= 0) return TYPE_KEYWORDS[i][1];
  }
  return null;
}

// 题型头（含可选题号前缀与分值）： 5.(单选题, 2.0 分) / （单选） / 【多选题】 / 单选：
const HEADER_RE = new RegExp(
  '^(?:\\d{1,3}[.、,，．]\\s*)?[（(\\[【]?(?:' + KW + ')[)）\\]】]?\\s*[:：,，]?\\s*(?:\\d+(?:\\.\\d+)?\\s*分\\s*[)）]?)?\\s*'
);

// 行中间的题型头（用于 "答案:B  4.(填空题...)" 这种粘连情况）
const MID_HEADER_RE = new RegExp('(?:\\d{1,3}[.、,，．]\\s*)?[（(](?:' + KW + ')[,，]', 'g');

/* ---------------- 选项标记工具 ---------------- */

// 字母选项标记位置：A. / A、 / A) / A． —— 排除 "H.216" 这类点后紧跟数字的文本
function findLetterMarks(line) {
  const out = [];
  const re = /[A-H][.、．:：)]/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    const after = line[m.index + 2];
    if (after && /[0-9]/.test(after)) continue; // 点后紧跟数字 → 是内容不是标记
    out.push(m.index);
  }
  return out;
}
function countLetterMarks(line) { return findLetterMarks(line).length; }

// （1）（2）风格标记位置
function findNumMarks(line) {
  const out = [];
  const re = /（[1-8]）/g;
  let m;
  while ((m = re.exec(line)) !== null) out.push(m.index);
  return out;
}
function countNumMarks(line) { return findNumMarks(line).length; }
// 全角+半角（n）引用计数（用于判断"列举项"行）
function countNumRefs(line) {
  const m = String(line).match(/[（(]\s*[1-8]\s*[)）]?/g);
  return m ? m.length : 0;
}

// 按标记位置切分行
function splitByMarksAt(line, positions) {
  if (!positions || positions.length === 0) return [line];
  const parts = [line.slice(0, positions[0])];
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i];
    const end = i + 1 < positions.length ? positions[i + 1] : line.length;
    parts.push(line.slice(start, end));
  }
  return parts;
}

/* ---------------- 元信息 ---------------- */

const META_SKIP = /^(?:我的答案|你的答案|所选答案|您的答案|作答)\s*[:：]?\s*\S*.*$/;
const DIFF_SKIP = /^(?:难度|分值|章节|知识点|来源|所属章节|题型)\s*[:：]/;
const ANALYSIS_RE = /^(?:解析|试题解析|分析|答案解析|试题分析)\s*[:：]\s*([\s\S]*)$/;
const ANSWER_RE = /^(?:正确答案|参考答案|标准答案|答案)\s*[:：]?\s*([\s\S]*)$/;

function splitLineByMidHeader(line) {
  MID_HEADER_RE.lastIndex = 0;
  let m;
  while ((m = MID_HEADER_RE.exec(line)) !== null) {
    if (m.index > 0) {
      return [line.slice(0, m.index), line.slice(m.index)];
    }
  }
  return null;
}

function isHeaderLine(line) {
  return HEADER_RE.test(line);
}

function hasBlankMarker(stem) {
  return /[（(]\s*[)）]/.test(stem) || /_{2,}/.test(stem);
}
function endsLikeQuestion(stem) {
  return /[)）？?]\s*$/.test(stem) || hasBlankMarker(stem);
}

function stripUserAnswerTail(line) {
  return line.replace(/(?:我的答案|你的答案|所选答案)\s*[:：]\s*[\s\S]*$/, '').trim();
}

function isOptionLikeLine(line) {
  if (/[\s（(][A-H][.、．:：)]/.test(line)) return true;
  if (/^[A-H][.、．:：)]/.test(line)) return true;
  if (/^（[1-8]）/.test(line)) return true;
  return false;
}

function isImplicitHeaderLine(line, nextLine) {
  if (META_SKIP.test(line) || ANSWER_RE.test(line) || DIFF_SKIP.test(line)) return false;
  if (isOptionLikeLine(line)) return false;
  if (line.length > 200) return false;
  if (!endsLikeQuestion(line)) return false;
  if (nextLine == null) return false;
  if (ANSWER_RE.test(nextLine) || META_SKIP.test(nextLine)) return true;
  if (isOptionLikeLine(nextLine)) return true;
  return false;
}

/* ---------------- 头段拆分（题干 / 选项A） ---------------- */

// head 可能是：纯题干、题干+选项A（题干含填空标记）、纯选项A
function splitHead(head, stemComplete) {
  head = (head || '').trim();
  if (!head) return { stem: '', option: null };
  if (countNumMarks(head) > 0) {
    return { stem: head, option: null };
  }
  if (hasBlankMarker(head)) {
    const lastClose = Math.max(head.lastIndexOf(')'), head.lastIndexOf('）'));
    if (lastClose >= 0) {
      const left = head.slice(0, lastClose + 1);
      const rawTail = head.slice(lastClose + 1);
      const tail = rawTail.replace(/^[。．.、,，;；:：\s]+/, '').trim();
      if (tail && (/^[。．.]/.test(rawTail) || (tail.length <= 6 && !/[。．.；！？]$/.test(tail)))) {
        return { stem: left, option: tail };
      }
    }
    return { stem: head, option: null };
  }
  if (stemComplete && head.length <= 30) {
    return { stem: '', option: head };
  }
  return { stem: head, option: null };
}

/* ---------------- 选项提取 ---------------- */

function extractOptions(stem, contentLines, type, warnings, initialOptions) {
  let options = (initialOptions || []).slice();
  let stemLines = [];
  const isChoice = type === 'single' || type === 'multi' || type === null;

  // 第一遍：字母风格（A. B. C.）
  for (let i = 0; i < contentLines.length; i++) {
    const line = contentLines[i];
    const marks = findLetterMarks(line);
    if (marks.length >= 2) {
      const chunks = splitByMarksAt(line, marks);
      const stemComplete = hasBlankMarker(stem) || endsLikeQuestion(stem) || stemLines.some(endsLikeQuestion);
      const hr = splitHead(chunks[0], stemComplete);
      if (hr.stem) stemLines.push(hr.stem);
      if (hr.option) options.push({ text: hr.option });
      for (let k = 1; k < chunks.length; k++) {
        let t = chunks[k].trim();
        if (!t) continue;
        const km = t.match(/^[A-H][.、．:：)]\s*/);
        const isKey = km && !(t.length > 2 && /[0-9]/.test(t[2]));
        if (isKey) {
          options.push({ key: t[0], text: t.slice(km[0].length).trim() });
        } else {
          // 无前缀块：合并进前一个空文本选项（如 "B. H.261"）
          if (options.length && options[options.length - 1].text === '') {
            options[options.length - 1].text = t;
          } else {
            options.push({ text: t });
          }
        }
      }
      continue;
    }
    if (marks.length === 1 && marks[0] === 0) {
      // 单标记且位于行首（该行是纯选项行）
      const km = line.match(/^[A-H][.、．:：)]\s*/);
      const isKey = km && !(line.length > 2 && /[0-9]/.test(line[2]));
      if (isKey) {
        options.push({ key: line[0], text: line.slice(km[0].length).trim() });
        continue;
      }
    }
    if (isChoice && options.length > 0 && line.length <= 120 && countNumMarks(line) === 0) {
      options.push({ text: line });
      continue;
    }
    stemLines.push(line);
  }

  // 第二遍：无字母选项时，按（1）（2）风格处理
  if (options.length === 0 && isChoice && contentLines.length > 0) {
    let hasNumStyle = false;
    for (let i = 0; i < contentLines.length; i++) {
      if (countNumMarks(contentLines[i]) > 0) { hasNumStyle = true; break; }
    }
    if (hasNumStyle) {
      const opts = [];
      const st = [];
      for (let i = 0; i < contentLines.length; i++) {
        const line = contentLines[i];
        const numMarks = findNumMarks(line);
        if (numMarks.length >= 1 && numMarks[0] === 0) {
          opts.push({ text: line });
        } else if (numMarks.length >= 1) {
          if (hasBlankMarker(stem) || endsLikeQuestion(stem)) {
            opts.push({ text: line });
          } else {
            st.push(line);
          }
        } else if (line.length <= 120) {
          opts.push({ text: line });
        } else {
          st.push(line);
        }
      }
      if (opts.length >= 2) {
        options = opts;
        stemLines = st;
      }
    }
  }

  // 第三遍：兜底——选择题一条选项都没有 → 尝试把全部短行当作选项
  if (options.length === 0 && (type === 'single' || type === 'multi')) {
    let ok = contentLines.length >= 2 && contentLines.length <= 8;
    if (ok) {
      for (let i = 0; i < contentLines.length; i++) {
        if (contentLines[i].length > 120) { ok = false; break; }
      }
    }
    if (ok && !(hasBlankMarker(stem) || /[？?]\s*$/.test(stem))) {
      ok = contentLines.every(l => l.length <= 60);
    }
    if (ok) {
      options = contentLines.map(l => ({ text: l }));
      stemLines = [];
    }
  }

  // 把"疑似缺前缀的选项A"（短、无句末标点、无列举序号）补到选项最前面
  if (options.length > 0 && (type === 'single' || type === 'multi')) {
    const promoted = [];
    const keep = [];
    for (let i = 0; i < stemLines.length; i++) {
      const l = stemLines[i];
      if (l.length <= 120 && countNumRefs(l) <= 1 &&
          !/[。；！？]\s*$/.test(l) && !/[，、]\s*$/.test(l) &&
          (hasBlankMarker(stem) || endsLikeQuestion(stem))) {
        promoted.push({ text: l });
      } else {
        keep.push(l);
      }
    }
    if (promoted.length) {
      options = promoted.concat(options);
      stemLines = keep;
    }
  }

  // 按顺序重新编号 A-H
  const KEYS = 'ABCDEFGH';
  const fixed = [];
  for (let i = 0; i < options.length && i < 8; i++) {
    fixed.push({ key: KEYS[i], text: options[i].text });
  }
  if (options.length > 8) {
    warnings.push('选项超过8个，多余选项已忽略');
  }

  const newStem = (stem ? stem + (stemLines.length ? '\n' : '') : '') + stemLines.join('\n');
  return { stem: newStem, options: fixed };
}

/* ---------------- 单题解析 ---------------- */

function joinAnswer(lines) {
  return (lines || []).join(' ').replace(/\n+/g, ' ').trim();
}

function extractLetters(s) {
  const m = String(s || '').toUpperCase().match(/[A-H]/g);
  if (!m) return [];
  const seen = {};
  const out = [];
  for (let i = 0; i < m.length; i++) {
    if (!seen[m[i]]) { seen[m[i]] = 1; out.push(m[i]); }
  }
  return out.sort();
}

function parseFillAnswer(rawAnswer, stem) {
  const parts = [];
  const re = /[（(]\s*(\d+)\s*[)）]\s*([^（()]*)/g;
  let m;
  while ((m = re.exec(rawAnswer)) !== null) {
    const v = m[2].trim();
    if (v) parts.push(splitAlternatives(v));
  }
  const blankCount = (stem.match(/_{2,}/g) || []).length;
  const total = Math.max(blankCount, parts.length, 1);
  while (parts.length < total) {
    if (parts.length === 0 && rawAnswer.trim()) {
      parts.push(splitAlternatives(rawAnswer.trim()));
    } else {
      parts.push([]);
    }
  }
  return parts;
}

function splitAlternatives(v) {
  return v.split(/[|｜\/;；,，、]/).map(s => s.trim()).filter(s => s !== '');
}

function parseBlock(headerLine, bodyLines, ctx) {
  const warnings = [];
  let type = null;
  let stem = '';
  let initialOptions = [];

  // 1) 从头部提取题型与剩余内容（可能内联选项）
  if (headerLine) {
    const m = headerLine.match(HEADER_RE);
    let rest;
    if (m) {
      type = mapType(m[0]);
      rest = headerLine.slice(m[0].length);
    } else {
      rest = headerLine;
    }
    rest = stripUserAnswerTail(rest);
    if (rest) {
      const marks = findLetterMarks(rest);
      if (marks.length >= 2) {
        const chunks = splitByMarksAt(rest, marks);
        const hr = splitHead(chunks[0], false);
        if (hr.stem) stem = hr.stem;
        if (hr.option) initialOptions.push({ text: hr.option });
        for (let k = 1; k < chunks.length; k++) {
          let t = chunks[k].trim();
          if (!t) continue;
          const km = t.match(/^[A-H][.、．:：)]\s*/);
          const isKey = km && !(t.length > 2 && /[0-9]/.test(t[2]));
          if (isKey) {
            initialOptions.push({ key: t[0], text: t.slice(km[0].length).trim() });
          } else if (initialOptions.length && initialOptions[initialOptions.length - 1].text === '') {
            initialOptions[initialOptions.length - 1].text = t;
          } else {
            initialOptions.push({ text: t });
          }
        }
      } else if (marks.length === 1) {
        const idx = marks[0];
        const head = rest.slice(0, idx);
        if (endsLikeQuestion(head)) {
          stem = head.trim();
          let t = rest.slice(idx).trim();
          const km = t.match(/^[A-H][.、．:：)]\s*/);
          const isKey = km && !(t.length > 2 && /[0-9]/.test(t[2]));
          if (isKey) initialOptions.push({ key: t[0], text: t.slice(km[0].length).trim() });
          else initialOptions.push({ text: t });
        } else {
          stem = rest;
        }
      } else {
        const numMarks = findNumMarks(rest);
        if (numMarks.length >= 2 && !hasBlankMarker(rest.slice(0, numMarks[0]))) {
          const chunks = splitByMarksAt(rest, numMarks);
          const hr = splitHead(chunks[0], false);
          if (hr.stem) stem = hr.stem;
          if (hr.option) initialOptions.push({ text: hr.option });
          for (let k = 1; k < chunks.length; k++) {
            if (chunks[k].trim()) initialOptions.push({ text: chunks[k].trim() });
          }
        } else {
          stem = rest;
        }
      }
    }
  }

  // 2) 扫描行：答案/解析/题干与选项候选
  const contentLines = [];
  const answerLines = [];
  const analysisLines = [];
  let inAnswer = false;
  const lines = bodyLines || [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (META_SKIP.test(line)) continue;
    if (DIFF_SKIP.test(line)) continue;

    const combined = line.match(/^(?:答案与解析|答案和解析|答案解析)\s*[:：]\s*([\s\S]*)$/);
    if (combined) {
      const t = combined[1];
      const parts = t.split(/解析\s*[:：]/);
      if (parts[0].trim()) answerLines.push(parts[0].trim());
      if (parts.length > 1 && parts[1].trim()) analysisLines.push(parts[1].trim());
      inAnswer = true;
      continue;
    }
    const a = line.match(ANSWER_RE);
    if (a) {
      let t = (a[1] || '').trim();
      const ap = t.split(/解析\s*[:：]/);
      if (ap[0]) answerLines.push(ap[0].trim());
      if (ap.length > 1 && ap[1].trim()) analysisLines.push(ap[1].trim());
      inAnswer = true;
      continue;
    }
    const an = line.match(ANALYSIS_RE);
    if (an) {
      if (an[1] && an[1].trim()) analysisLines.push(an[1].trim());
      continue;
    }
    if (inAnswer) {
      if (isHeaderLine(line)) break; // 防御：下一题开始
      if (answerLines.length) answerLines[answerLines.length - 1] += '\n' + line;
      continue;
    }
    contentLines.push(stripUserAnswerTail(line));
  }

  // 3) 提取选项
  const optResult = extractOptions(stem, contentLines, type, warnings, initialOptions);
  stem = optResult.stem;
  let options = optResult.options;

  // 4) 题型推断（无标签时）
  if (!type) {
    if (options.length > 0) {
      const letters = extractLetters(joinAnswer(answerLines));
      type = letters.length > 1 ? 'multi' : 'single';
    } else if (hasBlankMarker(stem) || /_{2,}/.test(stem)) {
      type = 'fill';
    } else {
      type = 'short';
    }
  }

  // 5) 选择类但没有选项 → 降级
  if ((type === 'single' || type === 'multi') && options.length === 0) {
    if (/_{2,}/.test(stem)) {
      type = 'fill';
    } else {
      type = 'short';
    }
    warnings.push('未识别到选项，已按' + util.TYPE_NAMES[type] + '处理');
  }
  if (type === 'multi' && options.length === 1) {
    type = 'single';
    warnings.push('多选题只有一个选项，已按单选题处理');
  }

  // 6) 答案归一化
  const rawAnswer = joinAnswer(answerLines);
  const answer = {};
  let hasAnswer = rawAnswer.trim() !== '';

  if (type === 'single' || type === 'multi') {
    const letters = extractLetters(rawAnswer);
    answer.letters = letters;
    const correctTexts = [];
    for (let i = 0; i < letters.length; i++) {
      const idx = letters[i].charCodeAt(0) - 65;
      if (options[idx]) correctTexts.push(options[idx].text);
      else warnings.push('答案 ' + letters[i] + ' 找不到对应选项');
    }
    answer.correctTexts = correctTexts;
  } else if (type === 'judge') {
    let v = util.normalizeJudge(rawAnswer);
    if (v === null) {
      const letters = extractLetters(rawAnswer);
      if (letters.length === 1 && (letters[0] === 'A' || letters[0] === 'B')) {
        v = letters[0] === 'A';
      } else if (rawAnswer.trim() !== '') {
        warnings.push('判断题答案无法识别：' + rawAnswer.slice(0, 20));
        hasAnswer = false;
      }
    }
    if (rawAnswer.trim() === '') hasAnswer = false;
    answer.judge = v === true;
  } else if (type === 'fill') {
    answer.blanks = parseFillAnswer(rawAnswer, stem);
    hasAnswer = rawAnswer.trim() !== '';
  } else {
    answer.text = rawAnswer.trim();
  }

  if (!hasAnswer) {
    warnings.push('该题缺少参考答案，作答后需自行判断对错');
  }

  return {
    type,
    stem: stem.replace(/\s+$/, '').trim(),
    options,
    answer,
    hasAnswer,
    analysis: analysisLines.join('\n').trim(),
    warnings
  };
}

/* ---------------- 主入口 ---------------- */

function parseQuizText(text) {
  const warnings = [];
  const questions = [];
  const stats = { single: 0, multi: 0, judge: 0, fill: 0, short: 0, total: 0 };

  let s = normalizeText(text);
  s = stripTags(s);

  const rawLines = s.split('\n').map(l => l.trim()).filter(l => l !== '');

  // 1) 行内拆分粘连的题型头
  const lines = [];
  for (let i = 0; i < rawLines.length; i++) {
    const parts = splitLineByMidHeader(rawLines[i]);
    if (parts) {
      if (parts[0].trim()) lines.push(parts[0].trim());
      lines.push(parts[1].trim());
    } else {
      lines.push(rawLines[i]);
    }
  }

  // 2) 分块
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isHeaderLine(line)) {
      blocks.push({ header: line, body: [] });
      continue;
    }
    if (blocks.length === 0) {
      blocks.push({ header: null, body: [] });
    }
    blocks[blocks.length - 1].body.push(line);
  }

  // 3) 无标签题再拆分：已出现答案的块里，遇到"疑似新题首行"
  const finalBlocks = [];
  for (let b = 0; b < blocks.length; b++) {
    const block = blocks[b];
    const sub = [{ header: block.header, body: [] }];
    let sawAnswer = false;
    for (let i = 0; i < block.body.length; i++) {
      const line = block.body[i];
      const nextLine = i + 1 < block.body.length ? block.body[i + 1] : null;
      const isAns = ANSWER_RE.test(line);
      if (sawAnswer && !isAns && isImplicitHeaderLine(line, nextLine)) {
        sub.push({ header: null, body: [line] });
        sawAnswer = false;
        continue;
      }
      sub[sub.length - 1].body.push(line);
      if (isAns) sawAnswer = true;
    }
    for (let sIdx = 0; sIdx < sub.length; sIdx++) {
      finalBlocks.push(sub[sIdx]);
    }
  }

  // 4) 解析每块
  for (let b = 0; b < finalBlocks.length; b++) {
    const block = finalBlocks[b];
    if (!block.header && block.body.length === 0) continue;
    if (!block.header) {
      const joined = block.body.join('\n');
      const looksLikeQuestion =
        ANSWER_RE.test(joined) || countLetterMarks(joined) > 0 || /_{2,}/.test(joined) ||
        block.body.some(l => endsLikeQuestion(l) && !META_SKIP.test(l));
      if (!looksLikeQuestion) continue;
    }
    const q = parseBlock(block.header, block.body, {});
    if (q.stem.trim() === '' && q.options.length === 0 && !q.hasAnswer) continue;
    q.id = util.uid();
    q.index = questions.length + 1;
    q.source = '';
    for (let w = 0; w < q.warnings.length; w++) {
      warnings.push({ no: q.index, text: q.warnings[w], type: q.type, stem: q.stem.slice(0, 30) });
    }
    delete q.warnings;
    questions.push(q);
    stats[q.type]++;
    stats.total++;
  }

  return { questions, stats, warnings };
}

/* ---------------- 背书内容解析 ---------------- */

function parseMemoText(text) {
  let s = normalizeText(text);
  s = stripTags(s);
  const lines = s.split('\n').map(l => l.trim()).filter(l => l !== '');

  const sections = [];
  let mode;
  if (lines.some(l => /^#{1,6}\s+/.test(l))) mode = 'markdown';
  else if (lines.length > 1 && lines.filter(l => /^\d+[.、]\s*/.test(l)).length >= Math.min(3, Math.ceil(lines.length / 2))) mode = 'numbered';
  else if (lines.some(l => /^[问Q]\s*[:：]/.test(l))) mode = 'qa';
  else mode = 'paragraph';

  if (mode === 'markdown') {
    let cur = null;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(#{1,6})\s+(.*)$/);
      if (m) {
        cur = { title: m[2].trim(), lines: [], qa: null };
        sections.push(cur);
      } else if (cur) {
        cur.lines.push(lines[i].replace(/^[-*•]\s+/, '').replace(/^\d+[.、]\s+/, ''));
      } else {
        cur = { title: '', lines: [lines[i]], qa: null };
        sections.push(cur);
      }
    }
  } else if (mode === 'numbered') {
    const sec = { title: '全文要点', lines: [], qa: null };
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].replace(/^\d+[.、]\s*/, '');
      if (t) sec.lines.push(t);
    }
    sections.push(sec);
  } else if (mode === 'qa') {
    let cur = null;
    for (let i = 0; i < lines.length; i++) {
      const qm = lines[i].match(/^[问Q]\s*[:：]\s*([\s\S]*)$/);
      const am = lines[i].match(/^[答A]\s*[:：]\s*([\s\S]*)$/);
      if (qm) {
        if (!cur || cur.qa === null) {
          cur = { title: '问答题卡', lines: [], qa: [] };
          sections.push(cur);
        }
        cur.qa.push({ q: qm[1].trim(), a: '' });
      } else if (am && cur && cur.qa && cur.qa.length) {
        cur.qa[cur.qa.length - 1].a = am[1].trim();
      } else if (cur) {
        cur.lines.push(lines[i].replace(/^[-*•]\s+/, ''));
      }
    }
    const hasQA = sections.some(sec => sec.qa && sec.qa.length);
    if (!hasQA) {
      sections.length = 0;
      sections.push({ title: '全文', lines, qa: null });
    }
  } else {
    if (lines.length <= 1) {
      sections.push({ title: '全文', lines, qa: null });
    } else {
      for (let i = 0; i < lines.length; i++) {
        sections.push({ title: '第' + (i + 1) + '段', lines: [lines[i]], qa: null });
      }
    }
  }

  // 段内问答对识别（问：/答：）
  sections.forEach(sec => {
    if (sec.qa || !sec.lines || sec.lines.length === 0) return;
    const qaPairs = [];
    const restLines = [];
    for (let i = 0; i < sec.lines.length; i++) {
      const qm = sec.lines[i].match(/^[问Q]\s*[:：]\s*([\s\S]*)$/);
      const am = sec.lines[i].match(/^[答A]\s*[:：]\s*([\s\S]*)$/);
      if (qm) {
        qaPairs.push({ q: qm[1].trim(), a: '' });
      } else if (am && qaPairs.length) {
        qaPairs[qaPairs.length - 1].a = am[1].trim();
      } else {
        restLines.push(sec.lines[i]);
      }
    }
    if (qaPairs.length) {
      sec.qa = qaPairs;
      sec.lines = restLines;
    }
  });

  const cleaned = sections.filter(sec =>
    (sec.lines && sec.lines.length > 0) || (sec.qa && sec.qa.length > 0)
  );
  if (cleaned.length === 0 && s.trim()) {
    cleaned.push({ title: '全文', lines: [s.trim()], qa: null });
  }

  const stats = { sections: cleaned.length, qa: 0 };
  cleaned.forEach(sec => { stats.qa += sec.qa ? sec.qa.length : 0; });

  return { sections: cleaned, stats };
}

module.exports = {
  normalizeText,
  parseQuizText,
  parseMemoText
};
