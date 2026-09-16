/**
 * Google Hotelsの日付ピッカーにある「次の日へ」矢印ボタン（▶）を1回クリックし、
 * チェックイン・チェックアウトを1日分だけ進める。
 *
 * 重要: これは「今すでに画面にあるボタンを、人が押した操作の代わりに1回だけ押す」処理であり、
 * 複数日を自動でループする機能ではない。ポップアップのボタンを押すたびに1回だけ実行される。
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
  nextBtn.click();

  return new Promise(function (resolve) {
    setTimeout(function () {
      resolve({
        ok: true,
        before: before,
        after: { checkIn: ci.value, checkOut: co.value }
      });
    }, 900);
  });
})();
