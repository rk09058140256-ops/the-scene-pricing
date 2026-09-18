(function () {
  "use strict";

  var state = {
    tabId: null,
    meta: null,
    rows: [], // { data: <row from content.js>, checked: boolean } — 現在のページの検出結果
    collected: {}, // { "YYYY-MM-DD": { hotelName, capturedAt, rows: [<row data>...] } } — 月次で蓄積した分
    planMemory: {}, // { otaId: planName } — 同一チャネルに複数プランがある場合に前回選んだプランを覚えておく
    comboBusy: false, // 「次の日へ進めて取得・追加」処理中は true。連打による多重実行を防ぐ
    lastSelection: null // 直近の buildInitialSelection() の結果（soldOut 判定を追加処理で参照するため）
  };

  var els = {
    statusBox: document.getElementById("statusBox"),
    extractBtn: document.getElementById("extractBtn"),
    advanceDayBtn: document.getElementById("advanceDayBtn"),
    metaBox: document.getElementById("metaBox"),
    metaHotel: document.getElementById("metaHotel"),
    metaCheckIn: document.getElementById("metaCheckIn"),
    metaAdults: document.getElementById("metaAdults"),
    dateInput: document.getElementById("dateInput"),
    officialLabel: document.getElementById("officialLabel"),
    tableBox: document.getElementById("tableBox"),
    rowCount: document.getElementById("rowCount"),
    rowsBody: document.getElementById("rowsBody"),
    addDayBox: document.getElementById("addDayBox"),
    addDayBtn: document.getElementById("addDayBtn"),
    addDayHint: document.getElementById("addDayHint"),
    toggleRawBtn: document.getElementById("toggleRawBtn"),
    rawBox: document.getElementById("rawBox"),
    rawText: document.getElementById("rawText"),
    monthlyCount: document.getElementById("monthlyCount"),
    monthlyProgress: document.getElementById("monthlyProgress"),
    monthlyBody: document.getElementById("monthlyBody"),
    clearMonthlyBtn: document.getElementById("clearMonthlyBtn"),
    includeUnmapped: document.getElementById("includeUnmapped"),
    monthlyCsvBtn: document.getElementById("monthlyCsvBtn"),
    monthlyCopyCsvBtn: document.getElementById("monthlyCopyCsvBtn"),
    monthlyCopyJsonBtn: document.getElementById("monthlyCopyJsonBtn"),
    monthlyCopyHint: document.getElementById("monthlyCopyHint"),
    webhookUrl: document.getElementById("webhookUrl"),
    webappStatus: document.getElementById("webappStatus"),
    sendDayBtn: document.getElementById("sendDayBtn"),
    sendDayHint: document.getElementById("sendDayHint"),
    monthlySendBtn: document.getElementById("monthlySendBtn"),
    monthlySendHint: document.getElementById("monthlySendHint"),
    advanceExtractAddBtn: document.getElementById("advanceExtractAddBtn"),
    planKeywords: document.getElementById("planKeywords")
  };

  var DEFAULT_WEBHOOK_URL = "https://the-scene-pricing.vercel.app/api/prices";

  function setStatus(msg, tone) {
    els.statusBox.textContent = msg || "";
    els.statusBox.className = "status" + (tone ? " " + tone : "");
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function guessIsoDate(label) {
    if (!label) return "";
    var m = label.match(/(\d{1,2})月(\d{1,2})日/);
    if (!m) return "";
    var month = Number(m[1]);
    var day = Number(m[2]);
    var now = new Date();
    var candidate = new Date(now.getFullYear(), month - 1, day);
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (candidate < today) {
      candidate = new Date(now.getFullYear() + 1, month - 1, day);
    }
    return candidate.getFullYear() + "-" + pad2(candidate.getMonth() + 1) + "-" + pad2(candidate.getDate());
  }

  function slugify(name) {
    var s = (name || "")
      .toLowerCase()
      .replace(/[.\s]+/g, "_")
      .replace(/[^\w]+/g, "")
      .replace(/^_+|_+$/g, "");
    return s || "channel";
  }

  function mapChannel(row) {
    if (row.isOfficial) {
      return { otaId: "tripla", otaName: els.officialLabel.value.trim() || "TRIPLA（自社予約）", recognized: true };
    }
    var name = row.channelName || "";
    if (name.indexOf("楽天") !== -1) return { otaId: "rakuten", otaName: "楽天トラベル", recognized: true };
    if (name.indexOf("じゃらん") !== -1) return { otaId: "jalan", otaName: "じゃらん", recognized: true };
    if (name.indexOf("一休") !== -1) return { otaId: "ikyu", otaName: "一休.com", recognized: true };
    return { otaId: slugify(name), otaName: name, recognized: false };
  }

  function yen(v) {
    if (v === null || v === undefined) return "-";
    return "¥" + Number(v).toLocaleString("ja-JP");
  }

  function csvField(v) {
    var s = String(v);
    if (/[",\n]/.test(s)) {
      s = '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function checkedRows() {
    return state.rows.filter(function (r) {
      return r.checked;
    });
  }

  // ---------- Webアプリ連携（POST /api/prices） ----------

  function toApiRows(dataRows) {
    var includeUnmapped = els.includeUnmapped.checked;
    return dataRows
      .map(function (data) {
        var mapped = mapChannel(data);
        if (!includeUnmapped && !mapped.recognized) return null;
        if (data.displayPrice === null) return null;
        return {
          otaId: mapped.otaId,
          otaName: mapped.otaName,
          price: data.displayPrice,
          discountType: "fixed",
          discountValue: data.discountYen || 0,
          planName: data.planName,
          note: data.note,
          bookingUrl: data.bookingUrl || undefined
        };
      })
      .filter(Boolean);
  }

  // 「満室」判定されたチャネルをWebアプリ/CSV向けの行に変換する。
  // buildInitialSelection は対応チャネル（tripla/楽天/じゃらん/一休）にしか満室判定を
  // 行わないため、ここでの追加フィルタは不要。価格情報を持たないため、data.displayPrice
  // 等は含めず status: "FULL" のみで表現する。
  function toApiSoldOutRows(soldOutList) {
    return (soldOutList || []).map(function (s) {
      return { otaId: s.otaId, otaName: s.otaName, status: "FULL" };
    });
  }

  function setWebappStatus(msg, tone) {
    els.webappStatus.textContent = msg || "";
    els.webappStatus.className = "webapp-status" + (tone ? " " + tone : "");
  }

  function sendToWebApp(days, source) {
    var url = (els.webhookUrl.value || DEFAULT_WEBHOOK_URL).trim();
    if (!url) {
      setWebappStatus("送信先URLを入力してください。", "error");
      return Promise.reject(new Error("no url"));
    }

    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: source, sentAt: new Date().toISOString(), days: days })
    })
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (body) {
            if (!res.ok || body.ok === false) {
              throw new Error((body && body.error) || "HTTP " + res.status);
            }
            return body;
          });
      })
      .then(function (body) {
        setWebappStatus(
          "送信成功: " + (body.recordsReceived || days.length) + "日分をWebアプリへ反映しました。",
          "ok"
        );
        return body;
      })
      .catch(function (err) {
        setWebappStatus(
          "送信に失敗しました: " + err.message + "（URL・Webアプリの起動状態をご確認ください）",
          "error"
        );
        throw err;
      });
  }

  els.sendDayBtn.addEventListener("click", function () {
    var dateIso = els.dateInput.value;
    if (!dateIso) {
      setStatus("出力する日付を指定してください。", "error");
      return;
    }
    var picked = checkedRows();
    var soldOut = (state.lastSelection && state.lastSelection.soldOut) || [];
    if (!picked.length && !soldOut.length) {
      setStatus("送信するチャネルが選択されていません（チェックボックスをご確認ください）。", "error");
      return;
    }
    var rows = toApiRows(
      picked.map(function (r) {
        return r.data;
      })
    ).concat(toApiSoldOutRows(soldOut));
    if (!rows.length) {
      setWebappStatus("送信できる行がありません（未対応チャネルのみ選択されています）。", "error");
      return;
    }
    sendToWebApp([{ date: dateIso, rows: rows }], "google-hotels-extension-day").then(function () {
      els.sendDayHint.classList.add("show");
      setTimeout(function () {
        els.sendDayHint.classList.remove("show");
      }, 1500);
    }, function () {});
  });

  els.webhookUrl.addEventListener("change", function () {
    chrome.storage.local.set({ webhookUrl: els.webhookUrl.value.trim() });
  });

  // ---------- 現在ページのプレビュー表示 ----------

  function renderMeta() {
    var meta = state.meta;
    els.metaBox.hidden = false;
    els.metaHotel.textContent = meta.hotelName || "-";
    els.metaCheckIn.textContent = meta.checkIn && meta.checkOut ? meta.checkIn + " 〜 " + meta.checkOut : "-";
    els.metaAdults.textContent = meta.adults ? "大人" + meta.adults + "名" : "-";
    els.dateInput.value = guessIsoDate(meta.checkIn);
  }

  function renderTable() {
    els.tableBox.hidden = false;
    els.addDayBox.hidden = false;
    els.rowCount.textContent = state.rows.length + "件のチャネル・プランを検出";
    els.rowsBody.innerHTML = "";

    state.rows.forEach(function (r, idx) {
      var mapped = mapChannel(r.data);
      var tr = document.createElement("tr");
      if (!mapped.recognized) tr.className = "unmapped";

      var tdCheck = document.createElement("td");
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = r.checked;
      cb.addEventListener("change", function () {
        state.rows[idx].checked = cb.checked;
      });
      tdCheck.appendChild(cb);

      var tdChannel = document.createElement("td");
      tdChannel.textContent = r.data.channelName;
      if (mapped.recognized) {
        var tag = document.createElement("span");
        tag.className = "channel-tag";
        tag.textContent = mapped.otaId;
        tdChannel.appendChild(tag);
      }
      if (r.data.bookingUrl) {
        var link = document.createElement("a");
        link.href = r.data.bookingUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.className = "booking-link";
        link.textContent = "🔗";
        link.title = "予約ページを新しいタブで開く";
        tdChannel.appendChild(link);
      }

      var tdPlan = document.createElement("td");
      tdPlan.textContent = r.data.planName || "(最安プラン)";

      var tdDisplay = document.createElement("td");
      tdDisplay.className = "price-cell";
      tdDisplay.textContent = yen(r.data.displayPrice);

      var tdFinal = document.createElement("td");
      tdFinal.className = "price-cell";
      tdFinal.textContent = yen(r.data.finalPrice);

      var tdNote = document.createElement("td");
      tdNote.className = "note-cell";
      tdNote.textContent = r.data.note || "-";

      tr.appendChild(tdCheck);
      tr.appendChild(tdChannel);
      tr.appendChild(tdPlan);
      tr.appendChild(tdDisplay);
      tr.appendChild(tdFinal);
      tr.appendChild(tdNote);
      els.rowsBody.appendChild(tr);
    });
  }

  // 「2階,スタンダードダブル,朝食,-夕朝食」のように、先頭に "-" を付けた語は
  // 「含まれていてはいけない」除外キーワードとして扱う（似た名前のプラン違いを除外するため）。
  function getPlanKeywords() {
    var tokens = (els.planKeywords.value || "")
      .split(/[,、]/)
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
    var include = tokens.filter(function (t) {
      return t.charAt(0) !== "-";
    });
    var exclude = tokens
      .filter(function (t) {
        return t.charAt(0) === "-";
      })
      .map(function (t) {
        return t.slice(1).trim();
      })
      .filter(Boolean);
    return { include: include, exclude: exclude };
  }

  function hasAnyPrice(row) {
    return row.finalPrice !== null || row.displayPrice !== null;
  }

  // 同じチャネルに複数行（プラン違い）が検出された場合、次の優先順で1行だけ選ぶ:
  //   1. 「対象プランの必須キーワード」が設定されていれば、含むべき語を全て含み、
  //      除外キーワードを含まない行（複数階に同名の部屋があるプロパティ等で、
  //      意図した部屋を確実に選ぶための最優先ルート）
  //   2. 前回そのチャネルで選んでいたプラン名（state.planMemory）と完全一致する行
  //   3. どちらにも当てはまらない場合は、そのチャネル内で最も安い実質価格（無ければ表示価格）の行
  //      （未追加のまま止めず、必ずどれか1行を選ぶための最終フォールバック）
  // 2または3の経路で選ばれた場合は呼び出し側に返し、ポップアップ上で案内する。
  //
  // 「満室（soldOut）」判定: そのチャネルが画面上には表示されているが、
  //   - 必須/除外キーワードに一致する行が1件も無い（＝対象プランの取り扱いが無い）、または
  //   - 価格が取得できた行が1件も無い（＝表示はあるが価格要素が無い）
  //   場合は、無関係な部屋タイプを誤って選ばないよう選択をスキップし、満室として扱う。
  function buildInitialSelection(rows) {
    var groups = {};
    rows.forEach(function (data, idx) {
      var otaId = mapChannel(data).otaId;
      if (!groups[otaId]) groups[otaId] = [];
      groups[otaId].push(idx);
    });

    var keywords = getPlanKeywords();
    var hasKeywords = keywords.include.length > 0 || keywords.exclude.length > 0;
    var checked = rows.map(function () {
      return false;
    });
    var cheapestFallbackOtaIds = [];
    var keywordMatchedOtaIds = [];
    var soldOut = []; // [{ otaId, otaName }]

    Object.keys(groups).forEach(function (otaId) {
      var indices = groups[otaId];
      var mappedFirst = mapChannel(rows[indices[0]]);
      if (!mappedFirst.recognized) return; // 未対応チャネルは既定OFFのまま

      function markSoldOut() {
        soldOut.push({ otaId: otaId, otaName: mappedFirst.otaName });
      }
      function priceOf(i) {
        return rows[i].finalPrice !== null ? rows[i].finalPrice : rows[i].displayPrice;
      }
      function hasAnyPriceByIdx(i) {
        return hasAnyPrice(rows[i]);
      }

      if (indices.length === 1) {
        if (!hasAnyPrice(rows[indices[0]])) {
          markSoldOut();
          return;
        }
        checked[indices[0]] = true;
        return;
      }

      if (hasKeywords) {
        var keywordMatches = indices.filter(function (i) {
          var planName = rows[i].planName || "";
          var includeOk = keywords.include.every(function (kw) {
            return planName.indexOf(kw) !== -1;
          });
          var excludeOk = keywords.exclude.every(function (kw) {
            return planName.indexOf(kw) === -1;
          });
          return includeOk && excludeOk;
        });
        if (keywordMatches.length === 0) {
          // 他の部屋タイプは表示されているが、対象プランに一致する行が無い＝対象プランは満室
          markSoldOut();
          return;
        }
        var keywordMatchesWithPrice = keywordMatches.filter(hasAnyPriceByIdx);
        if (!keywordMatchesWithPrice.length) {
          markSoldOut();
          return;
        }
        if (keywordMatchesWithPrice.length === 1) {
          checked[keywordMatchesWithPrice[0]] = true;
          keywordMatchedOtaIds.push(otaId);
          return;
        }
        // キーワードだけでは1件に絞れない場合、その中で最安値を選ぶ
        // （無関係な部屋タイプに広がらないよう、候補はキーワード一致した行の中だけに限定する）
        var cheapestAmongMatches = keywordMatchesWithPrice.reduce(function (best, i) {
          return priceOf(i) < priceOf(best) ? i : best;
        }, keywordMatchesWithPrice[0]);
        checked[cheapestAmongMatches] = true;
        keywordMatchedOtaIds.push(otaId);
        return;
      }

      var remembered = state.planMemory[otaId];
      var matched = remembered
        ? indices.filter(function (i) {
            return rows[i].planName === remembered;
          })
        : [];

      if (matched.length === 1 && hasAnyPrice(rows[matched[0]])) {
        checked[matched[0]] = true;
        return;
      }

      var withPrice = indices.filter(hasAnyPriceByIdx);
      if (!withPrice.length) {
        // 価格が取れている行が1つも無い＝満室
        markSoldOut();
        return;
      }

      var cheapestIdx = withPrice.reduce(function (best, i) {
        return priceOf(i) < priceOf(best) ? i : best;
      }, withPrice[0]);

      checked[cheapestIdx] = true;
      cheapestFallbackOtaIds.push(otaId);
    });

    return {
      checked: checked,
      cheapestFallbackOtaIds: cheapestFallbackOtaIds,
      keywordMatchedOtaIds: keywordMatchedOtaIds,
      soldOut: soldOut
    };
  }

  function rememberPlanSelection(dataRows) {
    var changed = false;
    dataRows.forEach(function (data) {
      if (!data.planName) return;
      var otaId = mapChannel(data).otaId;
      if (state.planMemory[otaId] !== data.planName) {
        state.planMemory[otaId] = data.planName;
        changed = true;
      }
    });
    if (changed) chrome.storage.local.set({ planMemory: state.planMemory });
  }

  function handleExtractResult(result) {
    if (!result || !result.rows || !result.rows.length) {
      setStatus(
        "価格データが見つかりませんでした。Google Hotelsの「料金」タブが開いているか確認してください。",
        "error"
      );
      els.metaBox.hidden = true;
      els.tableBox.hidden = true;
      els.addDayBox.hidden = true;
      state.lastSelection = { cheapestFallbackOtaIds: [], keywordMatchedOtaIds: [], soldOut: [] };
      return state.lastSelection;
    }
    state.meta = result.meta;
    var selection = buildInitialSelection(result.rows);
    state.lastSelection = selection;
    state.rows = result.rows.map(function (data, idx) {
      return { data: data, checked: selection.checked[idx] };
    });
    renderMeta();
    renderTable();
    els.rawText.value = JSON.stringify(result, null, 2);

    var msg = state.rows.length + "件を取得しました。";
    if (selection.keywordMatchedOtaIds.length) {
      msg += " キーワード一致で選択: " + selection.keywordMatchedOtaIds.join("、") + "。";
    }
    if (selection.soldOut.length) {
      msg +=
        " 満室と判定: " +
        selection.soldOut
          .map(function (s) {
            return s.otaName;
          })
          .join("、") +
        "（対象プランに一致する空室が見つかりませんでした。月次リストには「満室」として記録されます）";
    }
    var hasWarning = Boolean(selection.cheapestFallbackOtaIds.length);
    if (selection.cheapestFallbackOtaIds.length) {
      msg +=
        " 複数プランが検出され最安値を自動選択したチャネル: " +
        selection.cheapestFallbackOtaIds.join("、") +
        "（意図した部屋と違う可能性があるので、テーブルでご確認ください）";
    } else if (!selection.keywordMatchedOtaIds.length && !selection.soldOut.length) {
      msg += " 内容を確認して「月次リストに追加」してください。";
    }
    setStatus(msg, hasWarning ? "error" : "ok");
    return selection;
  }

  function withGoogleHotelsTab(callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs && tabs[0];
      if (!tab || !tab.id) {
        setStatus("アクティブなタブが見つかりません。", "error");
        return;
      }
      state.tabId = tab.id;

      if (!/^https:\/\/(www\.)?google\.[a-z.]+\/travel\//.test(tab.url || "")) {
        setStatus(
          "Google Hotelsのホテル詳細画面（google.com/travel/...）で「料金」タブを開いた状態で実行してください。",
          "error"
        );
        return;
      }

      callback(tab);
    });
  }

  els.extractBtn.addEventListener("click", function () {
    setStatus("取得中...");
    withGoogleHotelsTab(function (tab) {
      chrome.scripting.executeScript(
        { target: { tabId: tab.id }, files: ["content.js"] },
        function (results) {
          if (chrome.runtime.lastError) {
            setStatus("抽出に失敗しました: " + chrome.runtime.lastError.message, "error");
            return;
          }
          var result = results && results[0] && results[0].result;
          handleExtractResult(result);
        }
      );
    });
  });

  // 「次の日へ進める」: Google Hotels自身の日付ピッカーにある「▶」ボタンを
  // その場で1回だけクリックする（自動ループではなく、ボタンを押した回数だけ実行される）。
  els.advanceDayBtn.addEventListener("click", function () {
    setStatus("日付を進めています...");
    withGoogleHotelsTab(function (tab) {
      chrome.scripting.executeScript(
        { target: { tabId: tab.id }, files: ["advance-day.js"] },
        function (results) {
          if (chrome.runtime.lastError) {
            setStatus("日付の切り替えに失敗しました: " + chrome.runtime.lastError.message, "error");
            return;
          }
          var result = results && results[0] && results[0].result;
          if (!result || !result.ok) {
            setStatus(
              (result && result.error) || "日付を進められませんでした。手動で「▶」を押してください。",
              "error"
            );
            return;
          }
          var dateMsg = "日付を " + result.after.checkIn + " 〜 " + result.after.checkOut + " に進めました。";
          if (result.priceMayBeStale) {
            setStatus(
              dateMsg + " 価格の再読み込みが完了したか確認できませんでした。少し待ってから「このページの価格を取得」を押してください。",
              "error"
            );
          } else {
            setStatus(dateMsg + " 続けて「このページの価格を取得」を押してください。", "ok");
          }
        }
      );
    });
  });

  els.toggleRawBtn.addEventListener("click", function () {
    els.rawBox.hidden = !els.rawBox.hidden;
  });

  // 「次の日へ進めて取得・追加」: advance-day.js → content.js → 月次リストへの追加、を
  // このボタン1クリックの中で順番に実行する。複数日を勝手にループする機能ではなく、
  // 押した回数（＝1日分）だけこの3ステップをまとめて行うショートカット。
  //
  // state.comboBusy は、この処理が完了する前に同じ操作が二重に走らないようにするための
  // ガード。キーボードショートカット（Enter/Space）で連打したときに、前回の
  // chrome.scripting.executeScript が終わる前に次のリクエストが割り込んで日付がズレる、
  // といった事故を防ぐ。
  function finishCombo(msg, tone) {
    state.comboBusy = false;
    els.advanceExtractAddBtn.disabled = false;
    setStatus(msg, tone);
  }

  function runAdvanceExtractAdd() {
    if (state.comboBusy) return;
    state.comboBusy = true;
    els.advanceExtractAddBtn.disabled = true;

    setStatus("日付を進めています...");
    withGoogleHotelsTab(function (tab) {
      chrome.scripting.executeScript(
        { target: { tabId: tab.id }, files: ["advance-day.js"] },
        function (advResults) {
          if (chrome.runtime.lastError) {
            finishCombo("日付の切り替えに失敗しました: " + chrome.runtime.lastError.message, "error");
            return;
          }
          var advResult = advResults && advResults[0] && advResults[0].result;
          if (!advResult || !advResult.ok) {
            finishCombo((advResult && advResult.error) || "日付を進められませんでした。", "error");
            return;
          }
          var staleWarning = advResult.priceMayBeStale
            ? "（価格の再読み込み完了を確認できなかったため、古い日付の価格が混ざっている可能性があります。念のため内容をご確認ください）"
            : "";

          setStatus("価格を取得しています...（" + advResult.after.checkIn + "）");
          chrome.scripting.executeScript(
            { target: { tabId: tab.id }, files: ["content.js"] },
            function (extResults) {
              if (chrome.runtime.lastError) {
                finishCombo("抽出に失敗しました: " + chrome.runtime.lastError.message, "error");
                return;
              }
              var extResult = extResults && extResults[0] && extResults[0].result;
              if (!extResult || !extResult.rows || !extResult.rows.length) {
                finishCombo(
                  "日付は " + advResult.after.checkIn + " まで進めましたが、価格データが見つかりませんでした。",
                  "error"
                );
                return;
              }

              var selection = handleExtractResult(extResult);
              var addResult = addCurrentSelectionToMonthlyList();

              if (!addResult.ok) {
                finishCombo(
                  advResult.after.checkIn + " の価格は取得できましたが、月次リストへの追加に失敗しました: " + addResult.error,
                  "error"
                );
                return;
              }

              var addedMsg = addResult.dateIso + " を追加しました（" + addResult.count + "件";
              if (addResult.soldOutCount) addedMsg += "、満室" + addResult.soldOutCount + "件";
              addedMsg += "）。";
              if (selection.keywordMatchedOtaIds.length) {
                addedMsg += " キーワード一致: " + selection.keywordMatchedOtaIds.join("、") + "。";
              }
              if (selection.cheapestFallbackOtaIds.length) {
                addedMsg +=
                  " 最安値を自動選択（要確認）: " + selection.cheapestFallbackOtaIds.join("、") + "。";
              } else {
                addedMsg += " 続けて押すと次の日に進みます。";
              }
              if (staleWarning) addedMsg += staleWarning;

              var hasWarning = Boolean(selection.cheapestFallbackOtaIds.length || staleWarning);
              finishCombo(addedMsg, hasWarning ? "error" : "ok");
            }
          );
        }
      );
    });
  }

  els.advanceExtractAddBtn.addEventListener("click", runAdvanceExtractAdd);

  // キーボードショートカット: Enter または Space で「次の日へ進めて取得・追加」を実行する。
  // マウスを使わずキー連打でテンポよく進められるようにするため。
  // テキスト入力欄・セレクト・チェックボックス等にフォーカスがある間は、通常の入力
  // （Enterでの送信やSpaceでの入力）を妨げないよう対象外にする。
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var target = e.target;
    var tag = target && target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (target && target.isContentEditable) return;
    e.preventDefault();
    runAdvanceExtractAdd();
  });

  // ---------- 月次リスト（蓄積） ----------

  function persistCollected() {
    chrome.storage.local.set({ collected: state.collected });
  }

  // dateInput（現在Google Hotels側に表示されている日付）が属する月を基準に、
  // その月のうち何日分がまだ月次リストに無いかを数える。「連打しすぎ」の防止用。
  function renderProgress(dates) {
    if (!els.monthlyProgress) return;
    var refIso = els.dateInput.value;
    var monthKey = refIso && /^\d{4}-\d{2}-\d{2}$/.test(refIso) ? refIso.slice(0, 7) : null;

    if (!monthKey) {
      els.monthlyProgress.textContent = "";
      return;
    }

    var year = Number(monthKey.slice(0, 4));
    var month = Number(monthKey.slice(5, 7));
    var totalDaysInMonth = new Date(year, month, 0).getDate();
    var collectedInMonth = dates.filter(function (d) {
      return d.indexOf(monthKey) === 0;
    }).length;
    var remaining = Math.max(0, totalDaysInMonth - collectedInMonth);
    var lastDate = dates.length ? dates[dates.length - 1] : null;

    els.monthlyProgress.textContent =
      monthKey +
      "分の未取得: あと" +
      remaining +
      "日（" +
      collectedInMonth +
      "/" +
      totalDaysInMonth +
      "日 取得済み）／最終取得日: " +
      (lastDate || "-");
  }

  function renderMonthly() {
    var dates = Object.keys(state.collected).sort();
    els.monthlyCount.textContent = "月次リスト: " + dates.length + "日分";
    renderProgress(dates);
    els.monthlyBody.innerHTML = "";

    if (dates.length === 0) {
      var tr = document.createElement("tr");
      var td = document.createElement("td");
      td.colSpan = 4;
      td.className = "empty-note";
      td.textContent = "まだ何も追加されていません。日ごとに「取得」→「月次リストに追加」を繰り返してください。";
      tr.appendChild(td);
      els.monthlyBody.appendChild(tr);
      return;
    }

    dates.forEach(function (dateIso) {
      var entry = state.collected[dateIso];
      var tr = document.createElement("tr");

      var tdDate = document.createElement("td");
      tdDate.className = "date-cell";
      tdDate.textContent = dateIso;

      var tdHotel = document.createElement("td");
      tdHotel.textContent = entry.hotelName || "-";

      var tdCount = document.createElement("td");
      var soldOutCount = (entry.soldOut || []).length;
      tdCount.textContent = entry.rows.length + "件" + (soldOutCount ? "（満室" + soldOutCount + "件）" : "");

      var tdRemove = document.createElement("td");
      var removeBtn = document.createElement("button");
      removeBtn.className = "remove-day-btn";
      removeBtn.textContent = "✕";
      removeBtn.title = dateIso + "を月次リストから削除";
      removeBtn.addEventListener("click", function () {
        delete state.collected[dateIso];
        persistCollected();
        renderMonthly();
      });
      tdRemove.appendChild(removeBtn);

      tr.appendChild(tdDate);
      tr.appendChild(tdHotel);
      tr.appendChild(tdCount);
      tr.appendChild(tdRemove);
      els.monthlyBody.appendChild(tr);
    });
  }

  function addCurrentSelectionToMonthlyList() {
    var dateIso = els.dateInput.value;
    if (!dateIso) {
      return { ok: false, error: "出力する日付を指定してください。" };
    }
    var picked = checkedRows();
    var soldOut = (state.lastSelection && state.lastSelection.soldOut) || [];
    if (!picked.length && !soldOut.length) {
      return { ok: false, error: "追加するチャネルが選択されていません（チェックボックスをご確認ください）。" };
    }
    var pickedData = picked.map(function (r) {
      return r.data;
    });
    state.collected[dateIso] = {
      hotelName: state.meta ? state.meta.hotelName : null,
      capturedAt: new Date().toISOString(),
      rows: pickedData,
      soldOut: soldOut
    };
    persistCollected();
    rememberPlanSelection(pickedData);
    renderMonthly();
    return { ok: true, dateIso: dateIso, count: picked.length, soldOutCount: soldOut.length };
  }

  els.addDayBtn.addEventListener("click", function () {
    var result = addCurrentSelectionToMonthlyList();
    if (!result.ok) {
      setStatus(result.error, "error");
      return;
    }
    els.addDayHint.classList.add("show");
    setTimeout(function () {
      els.addDayHint.classList.remove("show");
    }, 1500);
    var addMsg = result.dateIso + " を月次リストに追加しました（" + result.count + "件";
    if (result.soldOutCount) addMsg += "、満室" + result.soldOutCount + "件";
    addMsg += "）。";
    setStatus(addMsg, "ok");
  });

  els.clearMonthlyBtn.addEventListener("click", function () {
    if (!Object.keys(state.collected).length) return;
    if (!window.confirm("月次リストを全て削除します。よろしいですか？")) return;
    state.collected = {};
    persistCollected();
    renderMonthly();
  });

  function collectedDates() {
    return Object.keys(state.collected).sort();
  }

  function buildMonthlyCsv() {
    var includeUnmapped = els.includeUnmapped.checked;
    var header = "date,otaId,otaName,price,discountType,discountValue,status";
    var lines = [header];
    collectedDates().forEach(function (dateIso) {
      state.collected[dateIso].rows.forEach(function (data) {
        if (data.displayPrice === null) return;
        var mapped = mapChannel(data);
        if (!includeUnmapped && !mapped.recognized) return;
        lines.push(
          [dateIso, csvField(mapped.otaId), csvField(mapped.otaName), data.displayPrice, "fixed", data.discountYen || 0, ""].join(",")
        );
      });
      (state.collected[dateIso].soldOut || []).forEach(function (s) {
        lines.push([dateIso, csvField(s.otaId), csvField(s.otaName), "", "", "", "full"].join(","));
      });
    });
    return lines.join("\n");
  }

  function buildMonthlyJson() {
    var includeUnmapped = els.includeUnmapped.checked;
    var out = collectedDates().map(function (dateIso) {
      var entry = state.collected[dateIso];
      var rows = entry.rows
        .map(function (data) {
          var mapped = mapChannel(data);
          if (!includeUnmapped && !mapped.recognized) return null;
          return {
            otaId: mapped.otaId,
            otaName: mapped.otaName,
            planName: data.planName,
            price: data.displayPrice,
            finalPrice: data.finalPrice,
            discountType: "fixed",
            discountValue: data.discountYen || 0,
            note: data.note,
            bookingUrl: data.bookingUrl || undefined
          };
        })
        .filter(Boolean);
      (entry.soldOut || []).forEach(function (s) {
        rows.push({ otaId: s.otaId, otaName: s.otaName, status: "FULL" });
      });
      return { date: dateIso, hotelName: entry.hotelName, rows: rows };
    });
    return JSON.stringify(out, null, 2);
  }

  els.monthlySendBtn.addEventListener("click", function () {
    var dates = collectedDates();
    if (!dates.length) {
      setWebappStatus("月次リストが空です。まずは日ごとに追加してください。", "error");
      return;
    }
    var days = dates
      .map(function (dateIso) {
        var rows = toApiRows(state.collected[dateIso].rows).concat(
          toApiSoldOutRows(state.collected[dateIso].soldOut)
        );
        return { date: dateIso, rows: rows };
      })
      .filter(function (d) {
        return d.rows.length > 0;
      });
    if (!days.length) {
      setWebappStatus("送信できる行がありません（未対応チャネルのみ選択されています）。", "error");
      return;
    }
    setWebappStatus("送信中...（" + days.length + "日分）");
    sendToWebApp(days, "google-hotels-extension-monthly").then(function () {
      els.monthlySendHint.classList.add("show");
      setTimeout(function () {
        els.monthlySendHint.classList.remove("show");
      }, 1500);
    }, function () {});
  });

  els.monthlyCsvBtn.addEventListener("click", function () {
    var dates = collectedDates();
    if (!dates.length) {
      setStatus("月次リストが空です。まずは日ごとに追加してください。", "error");
      return;
    }
    var csv = buildMonthlyCsv();
    var blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "ota_prices_" + dates[0] + "_to_" + dates[dates.length - 1] + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  function showMonthlyCopyHint() {
    els.monthlyCopyHint.classList.add("show");
    setTimeout(function () {
      els.monthlyCopyHint.classList.remove("show");
    }, 1500);
  }

  function copyText(text, onDone) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(onDone, function () {
        fallbackCopy(text, onDone);
      });
    } else {
      fallbackCopy(text, onDone);
    }
  }

  function fallbackCopy(text, onDone) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      onDone();
    } catch (e) {
      setStatus("コピーに失敗しました。", "error");
    }
    document.body.removeChild(ta);
  }

  els.monthlyCopyCsvBtn.addEventListener("click", function () {
    if (!collectedDates().length) {
      setStatus("月次リストが空です。", "error");
      return;
    }
    copyText(buildMonthlyCsv(), showMonthlyCopyHint);
  });

  els.monthlyCopyJsonBtn.addEventListener("click", function () {
    if (!collectedDates().length) {
      setStatus("月次リストが空です。", "error");
      return;
    }
    copyText(buildMonthlyJson(), showMonthlyCopyHint);
  });

  // ---------- 初期化 ----------

  els.officialLabel.addEventListener("change", function () {
    chrome.storage.local.set({ officialLabel: els.officialLabel.value.trim() });
  });

  els.planKeywords.addEventListener("change", function () {
    chrome.storage.local.set({ planKeywords: els.planKeywords.value.trim() });
  });

  chrome.storage.local.get(
    ["officialLabel", "collected", "webhookUrl", "planMemory", "planKeywords"],
    function (res) {
      if (res && res.officialLabel) {
        els.officialLabel.value = res.officialLabel;
      }
      if (res && res.collected) {
        state.collected = res.collected;
      }
      if (res && res.planMemory) {
        state.planMemory = res.planMemory;
      }
      if (res && res.planKeywords) {
        els.planKeywords.value = res.planKeywords;
      }
      els.webhookUrl.value = (res && res.webhookUrl) || DEFAULT_WEBHOOK_URL;
      renderMonthly();
    }
  );
})();
