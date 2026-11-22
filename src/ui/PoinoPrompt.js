// 0.80.27 — 포이노(poinolunch) 연결을 묻는 작은 창. 포이노에서 #poino=닉네임 을 달고 들어온 사람에게 로그인 뒤 한 번.
// 이어 두면 이 서버가 주말의 게임 기록(5단계 보스 · Lv.20 도달 · 탑 최고층)을 포이노 순위에 올린다(server/poino.js).
import { setHtml } from './keepScroll.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * @param {{root:HTMLElement, name:string, was?:string|null, onAnswer:(yes:boolean)=>void}} opts
 */
export function askPoino({ root, name, was = null, onAnswer }) {
  const box = document.createElement('div');
  box.className = 'poino-ask';
  setHtml(box, `
    <div class="poino-card wp-panel">
      <h3>포이노와 연결할까요?</h3>
      <p>포이노 프로필 <b>「${esc(name)}」</b>에서 왔습니다.<br>
        연결하면 이 캐릭터의 <b>5단계 보스 시간 · Lv.20 시간 · 탑 최고층</b>이 주말의 게임 순위에 올라갑니다.</p>
      ${was ? `<p class="poino-was">지금은 「${esc(was)}」와 이어져 있습니다 — 바꿉니다.</p>` : ''}
      <div class="poino-row">
        <button class="confirm-btn" data-yes>연결</button>
        <button class="confirm-btn poino-no" data-no>나중에</button>
      </div>
      <small>포이노 이름 하나에는 드래곤필드 계정 하나만 이어집니다.</small>
    </div>`);
  const done = (yes) => { box.remove(); onAnswer(yes); };
  box.querySelector('[data-yes]').addEventListener('click', () => done(true));
  box.querySelector('[data-no]').addEventListener('click', () => done(false));
  root.appendChild(box);
  return box;
}
