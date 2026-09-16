/**
 * Google Hotelsの日付ピッカーにある「次の日へ」矢印ボタン（▶）を1回クリックし、
 * チェックイン・チェックアウトを1日分だけ進める。
 *
 * 重要: これは「今すでに画面にあるボタンを、人が押した操作の代わりに1回だけ押す」処理であり、
 * 複数日を自動でループする機能ではない。ポップアップのボタンを押すたびに1回だけ実行される。
 *
 * 【価格取得のタイミングについて】
 * チェックイン/チェックアウトの入力欄はクリック直後に即座に新しい日付の表示へ更新されるが、
 * 実際の価格リスト（各チャネルの金額）はGoogle側が非同期で再取得・再描画するため、
 * 実機検証では新しい価格が反映されるまで 1.5〜2.5秒程度（回線状況により変動）かかることを確認した。
 * 固定時間の待機（例: 900ms）だと、価格がまだ古い日付のまま残っている状態で
 * 後続の価格取得（content.js）が走ってしまい、画面表示と抽出結果がズレる不具合があった。
 * そのため、価格表示テキストのスナップショットをポーリングして「クリック前から変化し、
 * かつ一定時間変化が止まった（＝再描画が完了した）」ことを検知してから完了を返す。
 *
 * DOM構造は実機（2026-09時点のGoogle Hotels）で確認済み:
 *   <div data-default-days="..." ...>              ← 日付ピッカー1インスタンス全体
 *     <div data-value="2026-09-23" ...>              ← チェックインの日付を保持するコンテナ
 *       <input aria-label="チェックイン" ...>
 *       <button data-delta="-1">前day</button>
 *       <button data-delta="1">次day</button>        ← これをクリックする
 *     </div>
 *     <div data-value="2026-09-24" ...>...</div>      ← チェックアウト側（別コンテナ）
 *   </div>
 * レスポンシブ対応で日付ピッカー全体がまるごと複数（非表示込み）描画されるため、
 * 「data-default-days を持つ最も外側のインスタンス」単位でvisibleなものを選び、
 * その内部だけでチェックイン用のボタンを探す（チェックインとチェックアウトの
 * 表示/非表示インスタンスが食い違わないようにするため）。
 */
(function advanceOneNight() {
  // content.js と同じ「◯◯ のサイトにアクセス」パターンで各チャネルの価格行を拾い、
  // その行のテキストを連結したものを「価格リストの状態」の指紋として使う。
  function snapshotPrices() {
    var ctas = Array.prototype.slice.call(document.querySelectorAll("[aria-label]")).filter(function (el) {
      var l = el.getAttribute("aria-label") || "";
      return (l.indexOf("のサイトにアクセス") !== -1 || l.indexOf("に移動") !== -1) && el.offsetParent !== null;
    });
    return ctas
      .map(function (cta) {
        var row = cta.closest("a");
        return row ? row.textContent.replace(/\s+/g, " ") : "";
      })
      .join("|")
      .slice(0, 4000);
  }

  var widgets = Array.prototype.slice.call(document.querySelectorAll("[data-default-days]"));
  var widget = widgets.filter(function (w) {
    var input = w.querySelector('input[aria-label="チェックイン"]');
    return input && input.offsetParent !== null;
  })[0];

  if (!widget) {
    return { ok: false, error: "日付ピッカーが見つかりませんでした（Google側の仕様変更の可能性があります）。" };
  }

  var ci = widget.querySelector('input[aria-label="チェックイン"]');
  var co = widget.querySelector('input[aria-label="チェックアウト"]');
  if (!ci || !co) {
    return { ok: false, error: "チェックイン/チェックアウトの入力欄が見つかりませんでした。" };
  }

  var container = ci.closest("[data-value]");
  if (!container) {
    return { ok: false, error: "日付ピッカーの構造が見つかりませんでした（Google側の仕様変更の可能性があります）。" };
  }

  var candidates = Array.prototype.slice.call(container.querySelectorAll('button[data-delta="1"]'));
  var nextBtn = candidates.filter(function (b) {
    return b.offsetParent !== null;
  })[0];

  if (!nextBtn) {
    return { ok: false, error: "「次の日へ」ボタンが見つかりませんでした。" };
  }

  var before = { checkIn: ci.value, checkOut: co.value };
  var beforeSnapshot = snapshotPrices();
  nextBtn.click();

  return new Promise(function (resolve) {
    var maxWaitMs = 8000; // これ以上は待たず、取れた状態のまま返す（回線が極端に遅い場合の保険）
    var pollIntervalMs = 200;
    var stableRequiredMs = 450; // この時間スナップショットが変化しなければ再描画完了とみなす
    var startTime = Date.now();
    var lastSnapshot = null;
    var lastChangeTime = Date.now();
    var changedAtLeastOnce = false;

    var timer = setInterval(function () {
      var now = Date.now();
      var snap = snapshotPrices();

      if (snap !== beforeSnapshot) changedAtLeastOnce = true;
      if (snap !== lastSnapshot) {
        lastSnapshot = snap;
        lastChangeTime = now;
      }

      var stableLongEnough = now - lastChangeTime >= stableRequiredMs;
      var timedOut = now - startTime >= maxWaitMs;

      if ((changedAtLeastOnce && stableLongEnough) || timedOut) {
        clearInterval(timer);
        resolve({
          ok: true,
          before: before,
          after: { checkIn: ci.value, checkOut: co.value },
          waitedMs: now - startTime,
          // 価格が最後まで変化を検知できないまま時間切れになった場合の目印
          // （前日と価格が偶然同額のケースもあるため、これ単体ではエラー扱いにしない）
          priceMayBeStale: timedOut && !changedAtLeastOnce
        });
      }
    }, pollIntervalMs);
  });
})();
