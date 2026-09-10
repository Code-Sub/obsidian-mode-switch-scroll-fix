# Mode Switch Scroll Fix for Obsidian

A lightweight Quality-of-Life (QoL) plugin that seamlessly preserves your exact scroll position when toggling between **Editing View** and **Reading View** (`Ctrl + E`).

## ❓ The Problem
In long documents or notes containing large tables, callouts, and code blocks, toggling views often causes the scroll position to jump unexpectedly to the top of the note or table.

## ✨ How it works
This plugin intercepts the mode switch event and triggers a microscopic, invisible DOM scroll refresh. This forces Obsidian and CodeMirror's virtual viewport caches to stay perfectly in sync without any visual jitter.

## 🚀 Installation
- **BRAT**: Add beta plugin using repository URL `https://github.com/Code-Sub/obsidian-mode-switch-scroll-fix`
- **Manual**: Download `main.js` and `manifest.json` from the latest Release into your vault's `.obsidian/plugins/mode-switch-scroll-fix/` folder.