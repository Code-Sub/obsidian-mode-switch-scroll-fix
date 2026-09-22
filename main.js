const { Plugin, MarkdownView, WorkspaceLeaf } = require('obsidian');

module.exports = class CursorScrollSyncPlugin extends Plugin {
	onload() {
		// =========================================================================
		// 1. 읽기 모드 ↔ 편집 모드 스크롤 정밀 동기화
		// =========================================================================
		const origSetMode = MarkdownView.prototype.setMode;
		this.origSetMode = origSetMode;

		MarkdownView.prototype.setMode = async function (mode, ...args) {
			const fromMode = this.getMode();

			try {
				// [1] 편집 모드 ➔ 읽기 모드
				if (fromMode === 'source') {
					const scroller = this.containerEl?.querySelector('.cm-scroller');
					if (scroller) {
						this._lastEditScrollTop = scroller.scrollTop;

						const top = scroller.scrollTop;
						scroller.scrollTop = top > 0 ? top - 1 : top + 1;
						scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
						scroller.scrollTop = top;
						scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
					}

					const res = await origSetMode.call(this, mode, ...args);

					const previewScroller = this.containerEl?.querySelector('.markdown-preview-view');
					if (previewScroller) {
						this._initialPreviewScrollTop = previewScroller.scrollTop;
					}

					return res;
				}

				// [2] 읽기 모드 ➔ 편집 모드
				else if (fromMode === 'preview') {
					const previewScroller = this.containerEl?.querySelector('.markdown-preview-view');
					const currentPreviewTop = previewScroller ? previewScroller.scrollTop : null;

					// 실제 픽셀 이동 여부 감지 (10px 이상 스크롤된 경우)
					const userActuallyScrolled =
						currentPreviewTop !== null &&
						this._initialPreviewScrollTop !== undefined &&
						Math.abs(currentPreviewTop - this._initialPreviewScrollTop) > 10;

					let previewScrollTop = null;
					let visualAnchor = null;

					if (previewScroller && userActuallyScrolled) {
						previewScrollTop = previewScroller.scrollTop;

						// [기준점 자석] 뷰포트 내에 보이는 헤딩(H1~H6) 탐색
						const pRect = previewScroller.getBoundingClientRect();
						const headings = Array.from(previewScroller.querySelectorAll('h1, h2, h3, h4, h5, h6'));

						for (const h of headings) {
							const r = h.getBoundingClientRect();
							// 화면 상단과 하단 사이에 온전히 보이는 헤딩 포착
							if (r.top >= pRect.top - 10 && r.bottom <= pRect.bottom) {
								const text = h.innerText.replace(/\s+/g, ' ').trim();
								if (text.length >= 3) {
									visualAnchor = {
										text: text.substring(0, 15),
										offsetFromTop: r.top - pRect.top // 뷰포트 상단으로부터의 정확한 픽셀 거리
									};
									break;
								}
							}
						}
					}

					const res = await origSetMode.call(this, mode, ...args);

					const restorePosition = () => {
						const scroller = this.containerEl?.querySelector('.cm-scroller');
						if (!scroller) return;

						// Case A: 읽기 모드에서 스크롤 안 함 ➔ 이전 편집 위치 복원
						if (!userActuallyScrolled && this._lastEditScrollTop !== undefined) {
							scroller.scrollTop = this._lastEditScrollTop;
							return;
						}

						// Case B: 읽기 모드에서 스크롤함
						if (previewScrollTop !== null) {
							// 1단계: 순수 본문 높이(바닥 여백 제외) 기준 1차 정렬
							const pSizer = previewScroller?.querySelector('.markdown-preview-sizer');
							const cmContent = scroller.querySelector('.cm-content');

							const pHeight = pSizer ? pSizer.scrollHeight : previewScroller.scrollHeight;
							const cmHeight = cmContent ? cmContent.scrollHeight : scroller.scrollHeight;

							const scale = (pHeight > 0 && cmHeight > 0) ? (cmHeight / pHeight) : 1;
							scroller.scrollTop = previewScrollTop * scale;

							// 2단계: 화면 내 헤딩이 있다면 자석처럼 0픽셀 오차로 미세 보정
							if (visualAnchor) {
								const sRect = scroller.getBoundingClientRect();
								const editHeadings = Array.from(scroller.querySelectorAll('h1, h2, h3, h4, h5, h6, .cm-heading'));

								const matchedH = editHeadings.find((h) => {
									const t = h.innerText.replace(/\s+/g, ' ').trim();
									return t.includes(visualAnchor.text);
								});

								if (matchedH) {
									const hRect = matchedH.getBoundingClientRect();
									const currentOffset = hRect.top - sRect.top;
									const diff = currentOffset - visualAnchor.offsetFromTop;

									// 1줄 정도(1~80px)의 미세 오차가 있을 때만 딱 보정
									if (Math.abs(diff) >= 1 && Math.abs(diff) < 100) {
										scroller.scrollTop += diff;
									}
								}
							}
						}
					};

					restorePosition();
					requestAnimationFrame(restorePosition);
					setTimeout(restorePosition, 40);
					setTimeout(restorePosition, 100);
					setTimeout(restorePosition, 250);

					return res;
				}
			} catch (err) {
				console.error('[ModeSwitchScrollFix Error (setMode)]:', err);
			}

			return origSetMode.call(this, mode, ...args);
		};

		// =========================================================================
		// 2. 소스 ↔ 라이브 편집 토글 유지
		// =========================================================================
		const LeafProto = WorkspaceLeaf?.prototype || Object.getPrototypeOf(this.app.workspace.getLeaf());
		const origSetViewState = LeafProto.setViewState;
		this.origSetViewState = origSetViewState;

		LeafProto.setViewState = async function (viewState, eState) {
			try {
				const view = this.view;
				const isMarkdown = view instanceof MarkdownView && typeof view.getMode === 'function';

				const isLiveVsSourceToggle =
					isMarkdown &&
					view.getMode() === 'source' &&
					viewState?.state?.mode === 'source' &&
					view.getState()?.source !== viewState?.state?.source;

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