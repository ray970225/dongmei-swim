(function () {
  var TARGET   = 'TMSC東美游泳隊';
  var GOLD_IDX = 5; /* 「美」字 */
  var CHARS_EN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*!';
  var CHARS_ZH = '游泳水波速力訓練健競選手技術隊員強衝';

  function randChar(ch) {
    var pool = /[\u4e00-\u9fff]/.test(ch) ? CHARS_ZH : CHARS_EN;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function renderChars(chars) {
    return chars.map(function(c, i) {
      var style = (i === GOLD_IDX) ? 'color:var(--gold,#f2c84b);' : '';
      return '<span style="' + style + '">' + c + '</span>';
    }).join('');
  }

  window.addEventListener('DOMContentLoaded', function () {
    var overlay = document.getElementById('intro-overlay');
    var brandEl = document.getElementById('intro-brand');
    var isMobile = window.matchMedia('(max-width: 640px)').matches;
    var scrambleInterval = isMobile ? 90 : 55;
    var scrambleDelay = isMobile ? 420 : 600;
    var decodeDuration = isMobile ? 900 : 1200;
    var settleDelay = isMobile ? 170 : 300;
    var revealDelay = isMobile ? 120 : 200;
    var len     = TARGET.length;
    var current = TARGET.split('').map(randChar);
    var lastHtml = '';

    function paint(chars) {
      var html = renderChars(chars);
      if (html !== lastHtml) {
        brandEl.innerHTML = html;
        lastHtml = html;
      }
    }

    paint(current);

    /* ① 亂碼閃爍 600ms */
    var timer = setInterval(function () {
      current = TARGET.split('').map(randChar);
      paint(current);
    }, scrambleInterval);

    setTimeout(function () {
      clearInterval(timer);

      /* ② 逐字解碼 1200ms */
      var duration = decodeDuration;
      var start    = null;
      var locked   = new Array(len).fill(false);

      function frame(ts) {
        if (!start) start = ts;
        var progress = Math.min((ts - start) / duration, 1);

        for (var i = 0; i < len; i++) {
          if (locked[i]) continue;
          var revealAt = (i / len) * 0.75;
          if (progress >= revealAt) {
            var p = (progress - revealAt) / 0.22;
            if (Math.random() < p || p >= 1) {
              current[i] = TARGET[i]; locked[i] = true;
            } else {
              current[i] = randChar(TARGET[i]);
            }
          } else {
            current[i] = randChar(TARGET[i]);
          }
        }
        paint(current);

        if (locked.some(function(v){ return !v; }) || progress < 1) {
          requestAnimationFrame(frame);
        } else {
          /* ③ 全部定格，300ms 後開始飛 */
          current = TARGET.split('');
          paint(current);

          setTimeout(function () {
            var targetEl = document.querySelector('.hero-brand-name');
            var toRect   = targetEl ? targetEl.getBoundingClientRect() : null;

            if (!toRect) { endIntro(); return; }

            var toSize = parseFloat(getComputedStyle(targetEl).fontSize);

            /* ④ 文字飛到左上角目標位置 */
            brandEl.style.fontSize      = toSize + 'px';
            brandEl.style.letterSpacing = getComputedStyle(targetEl).letterSpacing;
            brandEl.style.top           = toRect.top  + 'px';
            brandEl.style.left          = toRect.left + 'px';
            brandEl.style.transform     = 'none';

            /* ⑤ 等文字飛完後，停留 200ms，再讓背景淡出 */
            brandEl.addEventListener('transitionend', function handler(e) {
              if (e.propertyName !== 'font-size') return;
              brandEl.removeEventListener('transitionend', handler);

              setTimeout(function () {
                /* 背景淡出 + 主頁面浮現 */
                overlay.classList.add('fly-out');
                document.body.classList.remove('intro-running');
                document.body.classList.add('intro-done');

                /* overlay 淡出完成後直接移除，hero-brand 接替 */
                overlay.addEventListener('transitionend', function handler2(e) {
                  if (e.propertyName !== 'opacity') return;
                  overlay.removeEventListener('transitionend', handler2);
                  overlay.style.display = 'none';
                });
              }, revealDelay);
            });

          }, settleDelay);
        }
      }

      requestAnimationFrame(frame);
    }, scrambleDelay);

    function endIntro() {
      overlay.classList.add('fly-out');
      document.body.classList.remove('intro-running');
      document.body.classList.add('intro-done');
      overlay.addEventListener('transitionend', function () {
        overlay.style.display = 'none';
      }, { once: true });
    }
  });
})();
