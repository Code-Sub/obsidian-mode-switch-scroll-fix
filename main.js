const { Plugin, MarkdownView, WorkspaceLeaf } = require('obsidian');

module.exports = class CursorScrollSyncPlugin extends Plugin {
    onload() {
        // =========================================================================
        // [기능 1] 읽기 모드 ↔ 편집 모드 전환 보정 (사용자 실제 입력 감지 방식)
        // =========================================================================
        const origSetMode = MarkdownView.prototype.setMode;
        this.origSetMode = origSetMode;

        MarkdownView.prototype.setMode = async function(mode, ...args) {
            const fromMode = this.getMode();

            try {
                // 1. 편집 모드 ➔ 읽기 모드
                if (fromMode === 'source') {
                    const scroller = this.containerEl?.querySelector('.cm-scroller');
                    if (scroller) {
                        const top = scroller.scrollTop;
                        this._lastEditScrollTop = top;

                        scroller.scrollTop = top > 0 ? top - 1 : top + 1;
                        scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
                        scroller.scrollTop = top;
                        scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
                    }

                    this._userInteractedInPreview = false;
                    const res = await origSetMode.call(this, mode, ...args);

                    const previewScroller = this.containerEl?.querySelector('.markdown-preview-view');
                    if (previewScroller && !previewScroller._hasScrollSyncListener) {
                        previewScroller._hasScrollSyncListener = true;

                        const markUserScrolled = () => {
                            this._userInteractedInPreview = true;
                        };

                        previewScroller.addEventListener('wheel', markUserScrolled, { passive: true });
                        previewScroller.addEventListener('pointerdown', markUserScrolled, { passive: true });
                        previewScroller.addEventListener('keydown', (e) => {
                            if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Space', 'Home', 'End'].includes(e.key)) {
                                markUserScrolled();
                            }
                        }, { passive: true });
                    }
                    return res;
                }

                // 2. 읽기 모드 ➔ 편집 모드
                else if (fromMode === 'preview') {
                    const userActuallyScrolled = this._userInteractedInPreview === true;
                    let targetScroll = null;

                    if (userActuallyScrolled) {
                        const previewScroller = this.containerEl?.querySelector('.markdown-preview-view');
                        if (previewScroller) {
                            const top = previewScroller.scrollTop;
                            previewScroller.scrollTop = top > 0 ? top - 1 : top + 1;
                            previewScroller.dispatchEvent(new Event('scroll', { bubbles: true }));
                            previewScroller.scrollTop = top;
                            previewScroller.dispatchEvent(new Event('scroll', { bubbles: true }));
                        }
                        targetScroll = this.currentMode?.getScroll ? this.currentMode.getScroll() : null;
                    }

                    const res = await origSetMode.call(this, mode, ...args);

                    const restorePosition = () => {
                        const scroller = this.containerEl?.querySelector('.cm-scroller');
                        if (!scroller) return;

                        if (!userActuallyScrolled && this._lastEditScrollTop !== undefined) {
                            scroller.scrollTop = this._lastEditScrollTop;
                        } else if (targetScroll !== null && this.currentMode?.applyScroll) {
                            this.currentMode.applyScroll(targetScroll);
                        }
                    };

                    restorePosition();
                    requestAnimationFrame(restorePosition);
                    setTimeout(restorePosition, 40);
                    setTimeout(restorePosition, 120);

                    return res;
                }
            } catch (err) {
                console.error('[ModeSwitchScrollFix Error (setMode)]:', err);
            }

            return origSetMode.call(this, mode, ...args);
        };

        // =========================================================================
        // [기능 2] 라이브 편집 모드 ↔ 편집 전용(소스) 모드 누적 밀림 방지
        // =========================================================================
        const LeafProto = WorkspaceLeaf?.prototype || Object.getPrototypeOf(this.app.workspace.getLeaf());
        const origSetViewState = LeafProto.setViewState;
        this.origSetViewState = origSetViewState;

        LeafProto.setViewState = async function(viewState, eState) {
            try {
                const view = this.view;
                const isMarkdown = view?.getViewType?.() === 'markdown';

                const isLiveVsSourceToggle = isMarkdown && 
                    (view.getMode() === 'source') && 
                    (viewState?.state?.mode === 'source') && 
                    (view.getState()?.source !== viewState?.state?.source);

                if (isLiveVsSourceToggle) {
                    const scroller = view.containerEl?.querySelector('.cm-scroller');
                    const targetTop = scroller ? scroller.scrollTop : 0;

                    const res = await origSetViewState.call(this, viewState, eState);

                    const lockScroll = () => {
                        const s = view.containerEl?.querySelector('.cm-scroller');
                        if (s && targetTop !== undefined) {
                            s.scrollTop = targetTop;
                        }
                    };

                    lockScroll();
                    requestAnimationFrame(lockScroll);
                    setTimeout(lockScroll, 40);
                    setTimeout(lockScroll, 120);

                    return res;
                }
            } catch (err) {
                console.error('[ModeSwitchScrollFix Error (setViewState)]:', err);
            }

            return origSetViewState.call(this, viewState, eState);
        };
    }

    onunload() {
        if (this.origSetMode) {
            MarkdownView.prototype.setMode = this.origSetMode;
        }
        if (this.origSetViewState) {
            const LeafProto = WorkspaceLeaf?.prototype || Object.getPrototypeOf(this.app.workspace.getLeaf());
            LeafProto.setViewState = this.origSetViewState;
        }
    }
};