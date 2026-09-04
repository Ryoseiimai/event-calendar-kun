// ===== event-calendar-kun 共通ロジック =====
// index.html / slideshow.html / cards.html から読み込む共通モジュール。
// データ構造・保存キー・シート連携・フィット計算など、index.html から
// そのまま切り出したロジックをまとめている(index.htmlの挙動は変えない)。
(function(global){
  "use strict";

  const STORAGE_PREFIX = "eventCalendarKun_"; // 年月ごとの保存キー接頭辞
  const WEEKDAY_LABELS = ["MON","TUE","WED","THU","FRI","SAT","SUN"];
  const THEME_COLORS = {
    navy:{main:"#1e3a6b"},
    black:{main:"#1a1a1a"},
    wine:{main:"#6b1e2f"},
    green:{main:"#1e6b3a"}
  };
  const MIN_FONT = 8;
  const MAX_FONT = 64;
  const FIT_EPS = 0.5;
  const FIT_SAFETY_STEP = 2;
  const HTML2CANVAS_URL = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";

  function storageKey(y,m){ return STORAGE_PREFIX + y + "-" + String(m).padStart(2,"0"); }

  // 2026年9月のみに紐付く初期サンプルデータ(index.htmlのSAMPLE_2026_09と同一)
  const SAMPLE_2026_09 = {
    "2026-08-31":"20:00-\nディズニー好き会",
    "2026-09-01":"20:00-\n男女飲み会 🩷",
    "2026-09-02":"19:00-\n異業種交流会",
    "2026-09-03":"20:00-\nラブタイプ会\n忠犬ハチ公\n最後の恋人多め！",
    "2026-09-04":"20:00-\n1998年会",
    "2026-09-05":"20:00-\n夏祭りイベント 🎆",
    "2026-09-06":"18:00-\n男女飲み会 🩷",
    "2026-09-07":"20:00-\nSwitch&ボドゲ会",
    "2026-09-08":"21:00-\n夢を語る会",
    "2026-09-09":"20:00-\n男女飲み会 🩷",
    "2026-09-10":"21:00-\n京久保会",
    "2026-09-11":"20:00-\nスマブラ会 🎮",
    "2026-09-12":"21:00-\nマッスル合コン 💪",
    "2026-09-13":"20:00-\n男女飲み会 🩷",
    "2026-09-14":"20:00-\n長畑美咲会",
    "2026-09-15":"20:00-\n大物会",
    "2026-09-16":"11:00-\n性なるお茶会\n19:00-\n貸切",
    "2026-09-17":"20:00-\nスポーツ会",
    "2026-09-18":"20:00-\nシーシャ会",
    "2026-09-19":"18:00-\n店舗経営者会\n20:00-\n1997年会",
    "2026-09-20":"19:00-\n街コン 🩷\n22:00-\nマッスル合コン 💪",
    "2026-09-21":"15:00-\nボドゲ会\n20:00-\n平成カラオケ会 🎤",
    "2026-09-22":"18:00-\n落語家イベント\n20:00-\nフットサル打上",
    "2026-09-23":"19:00-\n男女飲み会 🩷",
    "2026-09-24":"20:00-\n静岡県人会 🗻",
    "2026-09-25":"21:00-\nさなBirthday 🎉",
    "2026-09-26":"18:00-\nクロちゃんタコス会 🌮\n21:00-\nMBTI会",
    "2026-09-27":"19:00-\n貸切",
    "2026-09-28":"19:00-\n沖縄好き会\n21:00-\n日本酒会 🍶",
    "2026-09-29":"20:00-\nインフルエンサー会",
    "2026-09-30":"20:00-\n男女飲み会 🩷"
  };

  function loadMonthData(y,m){
    const raw = localStorage.getItem(storageKey(y,m));
    if(raw){
      try{ return JSON.parse(raw); }catch(e){ /* 壊れたデータは無視して空扱い */ }
    }
    if(y===2026 && m===9 && localStorage.getItem(STORAGE_PREFIX+"seeded")!== "1"){
      const seeded = {};
      Object.keys(SAMPLE_2026_09).forEach(k=>{ seeded[k] = {text:SAMPLE_2026_09[k]}; });
      return seeded;
    }
    return {};
  }

  function saveMonthData(y,m,data){
    localStorage.setItem(storageKey(y,m), JSON.stringify(data));
    if(y===2026 && m===9){ localStorage.setItem(STORAGE_PREFIX+"seeded","1"); }
  }

  function dateKey(y,m,d){
    return y+"-"+String(m).padStart(2,"0")+"-"+String(d).padStart(2,"0");
  }

  function buildDaysList(year, month){
    const first = new Date(year, month-1, 1);
    const jsDay = first.getDay();
    const leadingOffset = (jsDay===0)?6:(jsDay-1);
    const daysInMonth = new Date(year, month, 0).getDate();
    const totalCells = Math.ceil((leadingOffset + daysInMonth)/7)*7;
    const list = [];
    const start = new Date(year, month-1, 1 - leadingOffset);
    for(let i=0;i<totalCells;i++){
      const d = new Date(start);
      d.setDate(start.getDate()+i);
      list.push({
        y:d.getFullYear(), m:d.getMonth()+1, d:d.getDate(),
        inMonth: d.getMonth()+1===month && d.getFullYear()===year,
        weekdayIdx: (d.getDay()===0)?6:(d.getDay()-1)
      });
    }
    return list;
  }

  function applyTheme(name){
    const c = THEME_COLORS[name] || THEME_COLORS.navy;
    document.documentElement.style.setProperty("--theme-main", c.main);
  }

  function htmlToLines(containerDiv){
    const html = containerDiv.innerHTML;
    return html.split(/<div>|<\/div>|<br\s*\/?>/i).filter(s=>s!==undefined);
  }

  function decorateTimeMarks(el){
    const hadFocus = document.activeElement===el;
    if(hadFocus) return;
    const html = el.innerHTML;
    if(el.dataset.decorated === html) return;
    const div = document.createElement("div");
    div.innerHTML = html;
    const lines = htmlToLines(div);
    const outParts = lines.map(line=>{
      if(/^<img/i.test(line.trim())) return line;
      const m = line.match(/^(\s*)(\d{1,2}:\d{2}-?)/);
      if(m){
        const rest = line.slice(m[0].length);
        return m[1] + '<span class="time-mark">' + m[2] + '</span>' + rest;
      }
      return line;
    });
    const newHtml = outParts.join("<br>");
    el.innerHTML = newHtml;
    el.dataset.decorated = el.innerHTML;
  }

  function getMaxFontFor(bodyEl){
    const cell = bodyEl.closest(".cell");
    const w = (cell && cell.clientWidth) ? cell.clientWidth : (bodyEl.clientWidth || MAX_FONT*3.2);
    return Math.max(MIN_FONT, Math.min(MAX_FONT, w/3.2));
  }

  function fitsWithin(bodyEl){
    void bodyEl.offsetHeight;
    if(bodyEl.scrollHeight > bodyEl.clientHeight + FIT_EPS) return false;
    if(bodyEl.scrollWidth > bodyEl.clientWidth + FIT_EPS) return false;
    const marks = bodyEl.querySelectorAll(".time-mark");
    for(let i=0;i<marks.length;i++){
      if(marks[i].offsetWidth > bodyEl.clientWidth + FIT_EPS) return false;
    }
    return true;
  }

  function fitOne(bodyEl){
    const hiCap = Math.floor(getMaxFontFor(bodyEl));
    let best = MIN_FONT;
    for(let size=hiCap; size>=MIN_FONT; size--){
      bodyEl.style.fontSize = size+"px";
      if(fitsWithin(bodyEl)){ best = size; break; }
    }
    best = Math.max(MIN_FONT, best - FIT_SAFETY_STEP);
    bodyEl.style.fontSize = best+"px";
  }

  function fitAllUniform(bodies){
    if(bodies.length===0) return;
    const hiCap = Math.floor(Math.min.apply(null, bodies.map(getMaxFontFor)));
    let best = MIN_FONT;
    for(let size=hiCap; size>=MIN_FONT; size--){
      bodies.forEach(b=>b.style.fontSize = size+"px");
      if(bodies.every(fitsWithin)){ best = size; break; }
    }
    best = Math.max(MIN_FONT, best - FIT_SAFETY_STEP);
    bodies.forEach(b=>b.style.fontSize = best+"px");
  }

  // 汎用: 単一要素をコンテナに収まる最大フォントサイズにフィットさせる
  // (スライドショー/カード用。cell依存の getMaxFontFor は使わず上限pxを引数で渡す)
  function fitTextToContainer(el, container, opts){
    opts = opts || {};
    const min = opts.min || 12;
    const max = opts.max || 400;
    let best = min;
    for(let size=max; size>=min; size -= (opts.step||2)){
      el.style.fontSize = size+"px";
      void el.offsetHeight;
      if(el.scrollHeight <= container.clientHeight + 1 && el.scrollWidth <= container.clientWidth + 1){
        best = size; break;
      }
    }
    el.style.fontSize = best+"px";
    return best;
  }

  // ---- CSV / シート連携 ----

  function parseCSV(text){
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    const s = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    for(let i=0;i<s.length;i++){
      const c = s[i];
      if(inQuotes){
        if(c === '"'){
          if(s[i+1] === '"'){ field += '"'; i++; }
          else { inQuotes = false; }
        }else{
          field += c;
        }
      }else{
        if(c === '"'){ inQuotes = true; }
        else if(c === ','){ row.push(field); field = ""; }
        else if(c === '\n'){ row.push(field); rows.push(row); row = []; field = ""; }
        else field += c;
      }
    }
    row.push(field);
    rows.push(row);
    while(rows.length && rows[rows.length-1].length===1 && rows[rows.length-1][0].trim()===""){
      rows.pop();
    }
    return rows;
  }

  function normalizeDateCell(str, fallbackYear){
    if(str===undefined || str===null) return null;
    const t = String(str).trim();
    if(t==="") return null;
    let m = t.match(/^(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/);
    if(m) return { y:parseInt(m[1],10), mo:parseInt(m[2],10), d:parseInt(m[3],10) };
    m = t.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
    if(m) return { y:fallbackYear, mo:parseInt(m[1],10), d:parseInt(m[2],10) };
    return null;
  }

  function normalizeTimeCell(str){
    if(str===undefined || str===null) return "";
    const t = String(str).trim();
    if(t==="") return "";
    const m = t.match(/^(\d{1,2}):(\d{2})/);
    if(m) return m[1] + ":" + m[2] + "-";
    return t;
  }

  function escapeHtmlText(str){
    return String(str)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;");
  }

  function sheetUrlToCsvUrl(rawUrl){
    const url = String(rawUrl).trim();
    if(!/^https?:\/\//i.test(url)) return url;
    if(!/docs\.google\.com/i.test(url)) return url;
    if(/output=csv/i.test(url)) return url;
    const idMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if(!idMatch) return url;
    const id = idMatch[1];
    const gidMatch = url.match(/[#&?]gid=([0-9]+)/);
    let out = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv`;
    if(gidMatch) out += "&gid=" + gidMatch[1];
    return out;
  }

  function buildEntryHtml(entry){
    const lines = [];
    if(entry.time) lines.push(escapeHtmlText(entry.time));
    let nameLine = escapeHtmlText(entry.name||"");
    if(entry.emoji) nameLine += " " + escapeHtmlText(entry.emoji);
    lines.push(nameLine);
    if(entry.imgUrl && /^https:\/\//i.test(entry.imgUrl)){
      lines.push(`<img class="ev-img" src="${escapeHtmlText(entry.imgUrl)}">`);
    }
    return lines.join("<br>");
  }

  function buildCellHtmlFromEntries(entries){
    return entries.map(buildEntryHtml).join("<br>");
  }

  // CSVの行配列(header含む)を、指定年月に該当する日付キーごとのentries配列にまとめる。
  function csvRowsToMonthEntries(rows, year, month){
    if(!rows.length) throw new Error("empty");
    const header = rows[0].map(h=>String(h).trim());
    const idxDate = header.indexOf("日付");
    if(idxDate === -1) throw new Error("ヘッダーに「日付」列が見つかりません");
    const idxTime = header.indexOf("時刻");
    const idxName = header.indexOf("イベント名");
    const idxEmoji = header.indexOf("絵文字");
    const idxImg = header.indexOf("画像URL");
    const byKey = {};
    for(let r=1;r<rows.length;r++){
      const row = rows[r];
      if(!row || row.every(c=>String(c).trim()==="")) continue;
      const dateCell = row[idxDate];
      const parsed = normalizeDateCell(dateCell, year);
      if(!parsed) continue;
      if(parsed.y !== year || parsed.mo !== month) continue;
      const key = dateKey(parsed.y, parsed.mo, parsed.d);
      const entry = {
        time: idxTime===-1 ? "" : normalizeTimeCell(row[idxTime]),
        name: idxName===-1 ? "" : String(row[idxName]||"").trim(),
        emoji: idxEmoji===-1 ? "" : String(row[idxEmoji]||"").trim(),
        imgUrl: idxImg===-1 ? "" : String(row[idxImg]||"").trim()
      };
      if(!byKey[key]) byKey[key] = [];
      byKey[key].push(entry);
    }
    return byKey;
  }

  // 指定シートURLをCSVとして取得し、指定年月のbyKey(dateKey→entries[])を返す。
  // 失敗時はErrorをrejectする(呼び出し側でメッセージ整形する)。
  function fetchSheetMonthEntries(rawUrl, year, month){
    if(!rawUrl) return Promise.reject(new Error("no-url"));
    const csvUrl = sheetUrlToCsvUrl(rawUrl);
    return fetch(csvUrl)
      .then(res=>{
        if(!res.ok) throw new Error("status:" + res.status);
        return res.text();
      })
      .then(text=>{
        if(/^\s*<(!doctype|html)/i.test(text)) throw new Error("shared");
        const rows = parseCSV(text);
        return csvRowsToMonthEntries(rows, year, month);
      });
  }

  function loadHtml2Canvas(onReady, onFail){
    if(global.html2canvas){ onReady(); return; }
    const script = document.createElement("script");
    script.src = HTML2CANVAS_URL;
    script.onload = onReady;
    script.onerror = onFail;
    document.head.appendChild(script);
  }

  // ---- 保存済みの月データ({dateKey:{html|text}}) からイベント一覧を作る ----
  // スライドショー/カード用の共通変換: [{key,y,m,d,time,body}]
  // bodyのHTMLから先頭の time-mark 相当(HH:MM-)を抜き出し、残りをイベント名として扱う。
  function extractEventsFromMonthData(monthData, year, month){
    const events = [];
    Object.keys(monthData).forEach(key=>{
      const m = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if(!m) return;
      const y = parseInt(m[1],10), mo = parseInt(m[2],10), d = parseInt(m[3],10);
      const entry = monthData[key];
      const html = entry.html!==undefined ? entry.html : (entry.text||"").replace(/\n/g,"<br>");
      const div = document.createElement("div");
      div.innerHTML = html;
      const lines = htmlToLines(div).map(l=>l.trim()).filter(l=>l!=="");
      let imgUrl = "";
      const textLines = [];
      lines.forEach(line=>{
        const imgMatch = line.match(/<img[^>]*src="([^"]*)"/i);
        if(imgMatch){ imgUrl = imgMatch[1]; return; }
        const plain = line.replace(/<[^>]+>/g,"").trim();
        if(plain!=="") textLines.push(plain);
      });
      // 先頭行が "HH:MM-" ならそれを時刻、残りをイベント名(複数件は改行で連結)として1件にまとめる。
      // 意図的な簡略化: 1マスに複数イベントがある場合、スライド/カードは1マス=1カード扱いで
      // 全行をまとめて表示する(個別分割はしない)。
      let time = "";
      const nameLines = [];
      textLines.forEach(line=>{
        const tm = line.match(/^(\d{1,2}:\d{2}-?)$/);
        if(tm && !time){ time = tm[1]; }
        else nameLines.push(line);
      });
      if(time==="" && nameLines.length){
        const tm2 = nameLines[0].match(/^(\d{1,2}:\d{2}-?)\s*(.*)$/);
        if(tm2 && tm2[2]){ time = tm2[1]; nameLines[0] = tm2[2]; }
      }
      const name = nameLines.join(" / ");
      if(name==="" && imgUrl==="") return;
      events.push({ key, y, m:mo, d, time, name, imgUrl });
    });
    events.sort((a,b)=> a.key<b.key?-1:a.key>b.key?1:0);
    return events;
  }

  global.CalKun = {
    STORAGE_PREFIX, WEEKDAY_LABELS, THEME_COLORS, MIN_FONT, MAX_FONT,
    storageKey, loadMonthData, saveMonthData, dateKey, buildDaysList,
    applyTheme, decorateTimeMarks, htmlToLines,
    getMaxFontFor, fitsWithin, fitOne, fitAllUniform, fitTextToContainer,
    parseCSV, normalizeDateCell, normalizeTimeCell, escapeHtmlText,
    sheetUrlToCsvUrl, buildEntryHtml, buildCellHtmlFromEntries,
    csvRowsToMonthEntries, fetchSheetMonthEntries,
    loadHtml2Canvas, HTML2CANVAS_URL,
    extractEventsFromMonthData
  };

})(window);
