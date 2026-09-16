/**
 * Google Hotels の料金比較画面から、現在レンダリングされている行を抽出する。
 *
 * 設計方針（重要）:
 * Google Hotels の class 名は難読化されたビルドハッシュで、Googleのデプロイ毎に変わりうる。
 * そのため主要な抽出は「◯◯ のサイトにアクセス」という aria-label の文言パターンに依存させ、
 * class 名には依存しない設計にしている。selector は2026-09時点で実機検証済み。
 * Google側のUI文言・構造が変わった場合は、下記の定数（CTA_ARIA_SUFFIXES / EXCLUDE_SUBSTRINGS /
 * 各種正規表現）を調整すること。ポップアップの「生データ表示」で rawText を見れば、
 * どのパターンが崩れたか切り分けやすい。
 *
 * ポップアップ側から chrome.scripting.executeScript({ files: ["content.js"] }) で注入され、
 * このファイル内で最後に評価された式（IIFEの戻り値）が実行結果として返る。
 */
(function extractGoogleHotelsPrices() {
  var CTA_ARIA_SUFFIXES = ["のサイトにアクセス", "に移動"];

  var EXCLUDE_SUBSTRINGS = [
    "サイトを見る",
    "1 泊の合計",
    "1泊の合計",
    "1 泊の料金",
    "1泊の料金",
    "滞在期間の合計額",
    "キャンセル無料",
    "までキャンセル",
    "素泊まり",
    "朝食のみ",
    "お食事",
    "部屋タイプ",
    "メンバー価格",
    "スポンサー",
    "1 泊 2 名で",
    "1泊2名で",
    "ポイント"
  ];
  var NOTE_PATTERN_RE = /\d+\s*pt\b|\d+\s*%\s*オフ/;
  var DASH_ONLY_RE = /^[—\-–\s]+$/;
  // Google側の表示価格は必ず桁区切りカンマ付きで描画される（¥1,000〜）。
  // 単純な [\d,]+ だと隣接テキストの数字（例:「1 泊 2 名で」の "1"）まで
  // 連結して誤取得するため、3桁区切りグループの構造そのものにマッチさせる。
  var PRICE_RE = /[¥￥]\s*(\d{1,3}(?:,\d{3})+)/g;

  function norm(s) {
    return (s || "").replace(/\s+/g, " ").trim();
  }

  function text(el) {
    return el ? norm(el.textContent) : "";
  }

  function isVisible(el) {
    if (!el) return false;
    return !!(el.offsetParent || (el.getClientRects && el.getClientRects().length));
  }

  function findCtaButtons() {
    var all = Array.prototype.slice.call(document.querySelectorAll("[aria-label]"));
    return all.filter(function (el) {
      var label = el.getAttribute("aria-label") || "";
      return CTA_ARIA_SUFFIXES.some(function (suffix) {
        return label.indexOf(suffix) !== -1 && label.length > suffix.length;
      });
    });
  }

  function getCheckInOut() {
    var ci = document.querySelector('input[aria-label="チェックイン"]');
    var co = document.querySelector('input[aria-label="チェックアウト"]');
    return {
      checkIn: ci ? norm(ci.value) : null,
      checkOut: co ? norm(co.value) : null
    };
  }

  function getAdults() {
    var el = document.querySelector('[aria-label="大人"]');
    if (!el) return null;
    var raw = text(el).replace("大人を削除", "").replace("大人を追加", "");
    var m = raw.match(/\d/);
    return m ? Number(m[0]) : null;
  }

  function getHotelName(firstCta) {
    // ページ内に h1 が複数存在し、検索結果件数見出しや「付近の場所」等の
    // セクション見出しが h1 として描画されることがある（Google側のマークアップが不安定）。
    // 最も安定して取れる基準は「価格比較の1行目（CTAボタン）より前にある最後の h1」＝
    // その価格セクションを実際に見出している要素、という位置関係。
    var h1s = Array.prototype.slice.call(document.querySelectorAll("h1"));
    if (firstCta) {
      var preceding = h1s.filter(function (h) {
        return !!(h.compareDocumentPosition(firstCta) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      if (preceding.length) return text(preceding[preceding.length - 1]);
    }
    var candidate = h1s.filter(function (h) {
      var t = text(h);
      return t && t.indexOf("件の結果") === -1;
    })[0];
    return candidate ? text(candidate) : h1s[0] ? text(h1s[0]) : null;
  }

  function guessPlanName(row, channelName) {
    var nodes = Array.prototype.slice.call(row.querySelectorAll("div,span"));
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.children.length > 0) continue;
      var t = text(el);
      if (t.length < 8) continue;
      if (t.indexOf("¥") !== -1 || t.indexOf("￥") !== -1) continue;
      if (t === channelName) continue;
      if (DASH_ONLY_RE.test(t)) continue;
      if (EXCLUDE_SUBSTRINGS.some(function (s) { return t.indexOf(s) !== -1; })) continue;
      if (NOTE_PATTERN_RE.test(t)) continue;
      return t;
    }
    return null;
  }

  function extractNote(rowText) {
    var memberOff = rowText.match(/メンバー価格[、,]?\s*(\d+)\s*%\s*オフ/);
    if (memberOff) return "メンバー価格、" + memberOff[1] + "% オフ";

    // ポイント還元表記（例: 楽天ポイント 225 pt (1%) / JTBトラベルポイント 226 pt）。
    // 数字は文字クラスに含めないことで、直前の価格の桁と誤って連結しないようにしている。
    var pointMatch = rowText.match(/([ァ-ヶーA-Za-zぁ-ゖ]{2,12}ポイント)\s*([\d,]+)\s*pt(\s*\((\d+)%\))?/);
    if (pointMatch) {
      var label = pointMatch[1] + " " + pointMatch[2] + " pt";
      if (pointMatch[4]) label += " (" + pointMatch[4] + "%)";
      return label;
    }

    var yenOff = rowText.match(/([\d,]+)\s*円引き/);
    if (yenOff) return yenOff[1] + "円引き";

    var percentOff = rowText.match(/(\d+)\s*%\s*オフ/);
    if (percentOff) return percentOff[1] + "% オフ";

    return null;
  }

  function extractRow(cta) {
    var row = cta.closest("a");
    if (!row) return null;

    var ariaLabel = cta.getAttribute("aria-label") || "";
    var channelName = null;
    for (var i = 0; i < CTA_ARIA_SUFFIXES.length; i++) {
      var suffix = CTA_ARIA_SUFFIXES[i];
      if (ariaLabel.indexOf(suffix) !== -1) {
        channelName = norm(ariaLabel.slice(0, ariaLabel.lastIndexOf(suffix)));
        break;
      }
    }
    if (!channelName) return null;

    var rowText = text(row);
    var isOfficial = rowText.indexOf("公式サイト") !== -1;

    // 実質価格（「1 泊 2 名で ¥XX,XXX」の表記。大人人数が2名以外でも拾えるよう \d+ にしている）
    var finalPrice = null;
    var finalMatch = rowText.match(/1\s*泊\s*\d+\s*名で\s*[¥￥]\s*(\d{1,3}(?:,\d{3})+)/);
    if (finalMatch) finalPrice = Number(finalMatch[1].replace(/,/g, ""));

    // 行内の価格をすべて拾い重複を除去（レスポンシブ対応で同じ値が複数回描画されるため）。
    // 最大値＝取り消し線の表示価格、最小値＝割引後の実質価格、という想定。
    var allPrices = [];
    var m;
    PRICE_RE.lastIndex = 0;
    while ((m = PRICE_RE.exec(rowText))) {
      allPrices.push(Number(m[1].replace(/,/g, "")));
    }
    var uniquePrices = Array.from(new Set(allPrices)).sort(function (a, b) {
      return b - a;
    });

    var displayPrice = null;
    if (uniquePrices.length >= 2) {
      displayPrice = uniquePrices[0];
      if (finalPrice === null) finalPrice = uniquePrices[uniquePrices.length - 1];
    } else if (uniquePrices.length === 1) {
      displayPrice = uniquePrices[0];
      if (finalPrice === null) finalPrice = uniquePrices[0];
    }

    var planName = guessPlanName(row, channelName);
    var note = extractNote(rowText);

    var discountYen = 0;
    if (displayPrice !== null && finalPrice !== null && displayPrice > finalPrice) {
      discountYen = displayPrice - finalPrice;
    }

    return {
      channelName: channelName,
      isOfficial: isOfficial,
      planName: planName,
      displayPrice: displayPrice,
      finalPrice: finalPrice,
      discountYen: discountYen,
      note: note,
      rawText: rowText.slice(0, 280)
    };
  }

  var visibleCtas = findCtaButtons().filter(isVisible);

  var seen = new Set();
  var rows = [];
  visibleCtas.forEach(function (cta) {
    var parsed = extractRow(cta);
    if (!parsed) return;
    var dedupeKey = parsed.channelName + "|" + parsed.planName + "|" + parsed.finalPrice;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    rows.push(parsed);
  });

  var checkInOut = getCheckInOut();
  var meta = {
    hotelName: getHotelName(visibleCtas[0]),
    checkIn: checkInOut.checkIn,
    checkOut: checkInOut.checkOut,
    adults: getAdults(),
    extractedAt: new Date().toISOString(),
    url: location.href
  };

  return { meta: meta, rows: rows };
})();
