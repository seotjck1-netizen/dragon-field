// 책임: "서버에 새 버전이 나왔다"는 알림 띠를 보여 준다.
// 금지: 게임 상태 접근, 저장. 새로고침은 넘겨받은 onReload 가 한다(저장 후 새로고침).

export class UpdateBanner {
  constructor({ bus, root, onReload }) {
    this.bus = bus;
    this.root = root;
    this.onReload = onReload;
    this.version = null;
    this.root.hidden = true;
  }

  show(version) {
    if (this.version === version) return; // 같은 버전 알림을 반복하지 않는다
    this.version = version;
    this.root.hidden = false;
    this.root.innerHTML = `
      <div class="update-card">
        <span class="update-dot"></span>
        <span class="update-text">새 콘텐츠 <b>v${version}</b> 가 배포되었습니다</span>
        <button class="update-btn" data-reload>지금 적용</button>
        <button class="update-close" data-later title="나중에">✕</button>
      </div>`;

    this.root.querySelector('[data-reload]').addEventListener('click', () => {
      this.root.querySelector('[data-reload]').textContent = '저장 중…';
      this.onReload();
    });
    this.root.querySelector('[data-later]').addEventListener('click', () => this.hide());
  }

  hide() {
    this.root.hidden = true;
  }
}
