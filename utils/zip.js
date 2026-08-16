// 纯 JS 实现的 ZIP 读取 + DEFLATE 解压（用于小程序内直接解析 .docx 文件，无第三方依赖）
(function (global) {
  'use strict';

  /* ---------------- DEFLATE (inflate) ---------------- */

  function InflateStream(data) {
    this.d = data;          // Uint8Array
    this.p = 0;             // byte pos
    this.bitBuf = 0;
    this.bitCnt = 0;
    this.out = [];
    this.outLen = 0;
    this.hist = new Uint8Array(32768);
    this.histLen = 0;
  }

  InflateStream.prototype.readBits = function (n) {
    while (this.bitCnt < n) {
      if (this.p >= this.d.length) throw new Error('inflate: 数据不完整');
      this.bitBuf |= this.d[this.p++] << this.bitCnt;
      this.bitCnt += 8;
    }
    const v = this.bitBuf & ((1 << n) - 1);
    this.bitBuf >>>= n;
    this.bitCnt -= n;
    return v;
  };

  InflateStream.prototype.alignByte = function () {
    this.bitCnt = 0;
    this.bitBuf = 0;
  };

  InflateStream.prototype.pushByte = function (b) {
    this.out.push(b & 0xff);
    this.outLen++;
    this.hist[this.histLen & 32767] = b & 0xff;
    this.histLen++;
  };

  InflateStream.prototype.copyFromHist = function (dist, len) {
    for (let i = 0; i < len; i++) {
      const b = this.hist[(this.histLen - dist) & 32767];
      this.pushByte(b);
    }
  };

  // 由码长数组构建 canonical Huffman 解码表
  function buildHuffman(lengths) {
    const maxLen = 15;
    const blCount = new Array(maxLen + 1).fill(0);
    lengths.forEach(l => { if (l > 0) blCount[l]++; });
    const nextCode = new Array(maxLen + 1).fill(0);
    let code = 0;
    for (let bits = 1; bits <= maxLen; bits++) {
      code = (code + blCount[bits - 1]) << 1;
      nextCode[bits] = code;
    }
    const table = [];
    for (let i = 0; i <= maxLen; i++) table.push({});
    for (let sym = 0; sym < lengths.length; sym++) {
      const len = lengths[sym];
      if (len > 0) {
        table[len][nextCode[len]] = sym;
        nextCode[len]++;
      }
    }
    return { table, minLen: 1, maxLen };
  }

  function decodeSym(st, stream) {
    const table = st.table;
    let code = 0;
    for (let len = 1; len <= st.maxLen; len++) {
      code = (code << 1) | stream.readBits(1);
      if (table[len] && table[len][code] !== undefined) return table[len][code];
    }
    throw new Error('inflate: 无效的 Huffman 编码');
  }

  const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

  function inflate(data, expectedLen) {
    const st = new InflateStream(data);
    const fixedLit = buildHuffman((function () {
      const l = [];
      for (let i = 0; i <= 287; i++) {
        if (i <= 143) l.push(8);
        else if (i <= 255) l.push(9);
        else if (i <= 279) l.push(7);
        else l.push(8);
      }
      return l;
    })());
    const fixedDist = buildHuffman(new Array(30).fill(5));

    let final = 0;
    do {
      final = st.readBits(1);
      const btype = st.readBits(2);
      if (btype === 0) {
        // 无压缩块
        st.alignByte();
        if (st.p + 4 > st.d.length) throw new Error('inflate: 数据不完整');
        const len = st.d[st.p] | (st.d[st.p + 1] << 8);
        const nlen = st.d[st.p + 2] | (st.d[st.p + 3] << 8);
        if ((len ^ 0xffff) !== nlen) throw new Error('inflate: LEN/NLEN 校验失败');
        st.p += 4;
        for (let i = 0; i < len; i++) {
          if (st.p >= st.d.length) throw new Error('inflate: 数据不完整');
          st.pushByte(st.d[st.p++]);
        }
      } else {
        let litTable, distTable;
        if (btype === 1) { litTable = fixedLit; distTable = fixedDist; }
        else if (btype === 2) {
          const hlit = st.readBits(5) + 257;
          const hdist = st.readBits(5) + 1;
          const hclen = st.readBits(4) + 4;
          const ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
          const clLen = new Array(19).fill(0);
          for (let i = 0; i < hclen; i++) clLen[ORDER[i]] = st.readBits(3);
          const clTable = buildHuffman(clLen);
          const lengths = [];
          while (lengths.length < hlit + hdist) {
            const sym = decodeSym(clTable, st);
            if (sym < 16) lengths.push(sym);
            else if (sym === 16) {
              if (lengths.length === 0) throw new Error('inflate: 无效的重复码');
              const prev = lengths[lengths.length - 1];
              const rep = 3 + st.readBits(2);
              for (let i = 0; i < rep; i++) lengths.push(prev);
            } else if (sym === 17) {
              const rep = 3 + st.readBits(3);
              for (let i = 0; i < rep; i++) lengths.push(0);
            } else if (sym === 18) {
              const rep = 11 + st.readBits(7);
              for (let i = 0; i < rep; i++) lengths.push(0);
            } else throw new Error('inflate: 无效的码长符号');
          }
          litTable = buildHuffman(lengths.slice(0, hlit));
          distTable = buildHuffman(lengths.slice(hlit, hlit + hdist));
        } else throw new Error('inflate: 不支持的块类型');

        // 解码 LZ77 数据
        for (;;) {
          const sym = decodeSym(litTable, st);
          if (sym < 256) { st.pushByte(sym); }
          else if (sym === 256) break;
          else {
            const li = sym - 257;
            if (li < 0 || li > 28) throw new Error('inflate: 无效的长度码');
            const len = LEN_BASE[li] + st.readBits(LEN_EXTRA[li]);
            const dsym = decodeSym(distTable, st);
            if (dsym < 0 || dsym > 29) throw new Error('inflate: 无效的距离码');
            const dist = DIST_BASE[dsym] + st.readBits(DIST_EXTRA[dsym]);
            if (dist > st.histLen) throw new Error('inflate: 距离超出窗口');
            st.copyFromHist(dist, len);
          }
        }
      }
    } while (!final);

    const result = new Uint8Array(st.outLen);
    for (let i = 0; i < st.outLen; i++) result[i] = st.out[i];
    return result;
  }

  /* ---------------- ZIP 容器解析 ---------------- */

  function u16(d, o) { return d[o] | (d[o + 1] << 8); }
  function u32(d, o) { return (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0; }

  // 返回 [{name, data: Uint8Array}]
  function parseZip(buf) {
    const d = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    // 从尾部找 EOCD (0x06054b50)
    let eocd = -1;
    const minFromEnd = Math.min(d.length, 22 + 65535);
    for (let i = d.length - 22; i >= d.length - minFromEnd && i >= 0; i--) {
      if (d[i] === 0x50 && d[i + 1] === 0x4b && d[i + 2] === 0x05 && d[i + 3] === 0x06) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('不是有效的 ZIP / docx 文件');
    const cdCount = u16(d, eocd + 10);
    const cdOffset = u32(d, eocd + 16);
    const entries = [];
    let p = cdOffset;
    for (let i = 0; i < cdCount; i++) {
      if (u32(d, p) !== 0x02014b50) throw new Error('ZIP 目录损坏');
      const method = u16(d, p + 10);
      const compSize = u32(d, p + 20);
      const uncompSize = u32(d, p + 24);
      const nameLen = u16(d, p + 28);
      const extraLen = u16(d, p + 30);
      const commentLen = u16(d, p + 32);
      const localOffset = u32(d, p + 42);
      const name = utf8Decode(d.subarray(p + 46, p + 46 + nameLen));
      // 本地文件头
      const lNameLen = u16(d, localOffset + 26);
      const lExtraLen = u16(d, localOffset + 28);
      const dataOffset = localOffset + 30 + lNameLen + lExtraLen;
      const raw = d.subarray(dataOffset, dataOffset + compSize);
      let data;
      if (method === 0) {
        data = new Uint8Array(raw);
      } else if (method === 8) {
        data = inflate(raw, uncompSize);
      } else {
        throw new Error('不支持的压缩方式: ' + method);
      }
      entries.push({ name, data });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }

  /* ---------------- UTF-8 解码 ---------------- */

  function utf8Decode(bytes) {
    let out = '';
    let i = 0;
    while (i < bytes.length) {
      const b0 = bytes[i++];
      if (b0 < 0x80) { out += String.fromCharCode(b0); }
      else if ((b0 & 0xe0) === 0xc0) {
        const b1 = bytes[i++];
        out += String.fromCharCode(((b0 & 0x1f) << 6) | (b1 & 0x3f));
      } else if ((b0 & 0xf0) === 0xe0) {
        const b1 = bytes[i++], b2 = bytes[i++];
        out += String.fromCharCode(((b0 & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f));
      } else {
        const b1 = bytes[i++], b2 = bytes[i++], b3 = bytes[i++];
        const cp = ((b0 & 0x07) << 18) | ((b1 & 0x3f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f);
        if (cp > 0xffff) {
          const ch = cp - 0x10000;
          out += String.fromCharCode(0xd800 + (ch >> 10), 0xdc00 + (ch & 0x3ff));
        } else {
          out += String.fromCharCode(cp);
        }
      }
    }
    return out;
  }

  function decodeEntities(s) {
    return s
      .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(parseInt(n, 10)))
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }

  /* ---------------- docx 文本抽取 ---------------- */

  function extractDocxText(buf) {
    const entries = parseZip(buf);
    let xmlEntry = null;
    for (let i = 0; i < entries.length; i++) {
      if (/^word\/document\.xml$/.test(entries[i].name)) { xmlEntry = entries[i]; break; }
    }
    if (!xmlEntry) {
      for (let i = 0; i < entries.length; i++) {
        if (/document\.xml$/.test(entries[i].name)) { xmlEntry = entries[i]; break; }
      }
    }
    if (!xmlEntry) throw new Error('docx 内未找到 document.xml');
    let xml = utf8Decode(xmlEntry.data);
    // 去掉 w:body 之外的内容，避免抽取到样式等
    const bodyMatch = xml.match(/<w:body[\s\S]*?<\/w:body>/);
    if (bodyMatch) xml = bodyMatch[0];
    let text = xml
      .replace(/<w:tab[^>]*\/>/g, '\t')
      .replace(/<w:br[^>]*\/>/g, '\n')
      .replace(/<w:p [^>]*>/g, '')
      .replace(/<w:p\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, '');
    text = decodeEntities(text);
    // 去掉空行
    const lines = text.split('\n').map(l => l.replace(/[\r]+$/, ''));
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() !== '') out.push(lines[i].trim());
    }
    return out.join('\n');
  }

  global.parseZip = parseZip;
  global.inflate = inflate;
  global.extractDocxText = extractDocxText;
  global.utf8Decode = utf8Decode;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseZip, inflate, extractDocxText, utf8Decode };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
