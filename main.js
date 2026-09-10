const { Plugin, MarkdownView } = require('obsidian');

module.exports = class CursorScrollSyncPlugin extends Plugin {
    onload() {
        console.log('[CursorScrollSync] 플러그인이 로드되었습니다.');

        // 1. 원본 setMode 함수 보관 (플러그인 끌 때 복구용)
        const origSetMode = MarkdownView.prototype.setMode;
        this.origSetMode = origSetMode;

        // 2. setMode 후킹
        MarkdownView.prototype.setMode = async function(mode, ...args) {
            const fromMode = this.getMode(); // 전환 전 현재 모드 ('source' 또는 'preview')

            try {
                // ==========================================
                // [방향 1] 편집 모드('source') ➔ 읽기 모드('preview')
                // ==========================================
                if (fromMode === 'source') {
                    const scroller = this.containerEl?.querySelector('.cm-scroller');
                    if (scroller) {
                        const top = scroller.scrollTop;
                        // 현재 편집 위치 기억
                        this._lastEditScrollTop = top;

                        // 미세 스크롤로 옵시디언/CodeMirror 내부 스크롤 리스너 강제 동기화
                        scroller.scrollTop = top > 0 ? top - 1 : top + 1;
                        scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
                        scroller.scrollTop = top;
                        scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
                    }

                    const res = await origSetMode.call(this, mode, ...args);

                    // 읽기 모드 진입 직후의 스크롤 위치 기록 (읽기 모드에서 스크롤 굴렸는지 감지용)
                    const previewScroller = this.containerEl?.querySelector('.markdown-preview-view');
                    if (previewScroller) {
                        this._previewScrollOnEnter = previewScroller.scrollTop;
                    }
                    return res;
                }

                // ==========================================
                // [방향 2] 읽기 모드('preview') ➔ 편집 모드('source')
                // ==========================================
                else if (fromMode === 'preview') {
                    const previewScroller = this.containerEl?.querySelector('.markdown-preview-view');
                    const currentPreviewTop = previewScroller ? previewScroller.scrollTop : 0;

                    // 사용자가 읽기 모드에서 실제로 스크롤을 굴렸는지 판별 (15px 이상 이동 시)
                    const userScrolledInPreview = (this._previewScrollOnEnter !== undefined) && 
                        (Math.abs(currentPreviewTop - this._previewScrollOnEnter) > 15);

                    let targetScroll = null;

                    if (userScrolledInPreview && previewScroller) {
                        // 읽기 모드에서 스크롤을 이동했다면 최신 라인 캐시 갱신
                        previewScroller.scrollTop = currentPreviewTop > 0 ? currentPreviewTop - 1 : currentPreviewTop + 1;
                        previewScroller.dispatchEvent(new Event('scroll', { bubbles: true }));
                        previewScroller.scrollTop = currentPreviewTop;
                        previewScroller.dispatchEvent(new Event('scroll', { bubbles: true }));
                        targetScroll = this.currentMode?.getScroll ? this.currentMode.getScroll() : null;
                    }

                    const res = await origSetMode.call(this, mode, ...args);

                    // CodeMirror 가상 DOM 렌더링 타이밍으로 인한 상단 튕김 방지
                    const restorePosition = () => {
                        const scroller = this.containerEl?.querySelector('.cm-scroller');
                        if (!scroller) return;

                        if (!userScrolledInPreview && this._lastEditScrollTop !== undefined) {
                            // 스크롤을 안 건드렸다면 이전 편집 위치로 1px 오차 없이 복원
                            scroller.scrollTop = this._lastEditScrollTop;
                        } else if (targetScroll !== null && this.currentMode?.applyScroll) {
                            // 읽기 모드에서 스크롤을 내렸다면 그 위치에 안착
                            this.currentMode.applyScroll(targetScroll);
                        }
                    };

                    // 가상 DOM 높이 계산 딜레이(0ms, 다음 프레임, 40ms, 120ms)를 고려해 위치 고정
                    restorePosition();
                    requestAnimationFrame(restorePosition);
                    setTimeout(restorePosition, 40);
                    setTimeout(restorePosition, 120);

                    return res;
                }
            } catch (err) {
                console.error('[CursorScrollSync Error]:', err);
            }

            return origSetMode.call(this, mode, ...args);
        };
    }

    onunload() {
        // 플러그인 비활성화 시 옵시디언 순정 함수로 원상복구
        if (this.origSetMode) {
            MarkdownView.prototype.setMode = this.origSetMode;
        }
        console.log('[CursorScrollSync] 플러그인이 언로드되었습니다 (원본 복원 완료).');
    }
};