# Deckfile

这是一个可部署到 GitHub Pages 的静态 Anki 风格复习网页。卡片数据用 Markdown 保存，网页端直接解析。

## 数据格式

推荐使用三字段格式：

```markdown
问题 | 答案 | 标签
什么是零矩阵？ | 所有元素都为 0 的矩阵。 | 数学::线性代数::矩阵
```

也支持 TSV：

```tsv
问题	答案	标签
什么是零矩阵？	所有元素都为 0 的矩阵。	数学::线性代数::矩阵
```

字段内可以使用常见 HTML，例如 `<b>`、`<code>`、`<ul><li>`。

## GitHub Pages 用法

1. 把这个 `flashcard-site` 目录提交到 GitHub 仓库。
2. 将 Markdown 卡片放入 `cards/`。
3. 在 `cards/index.json` 中登记文件：

```json
{
  "decks": [
    {"name": "数学", "file": "math.md"}
  ]
}
```

4. 在仓库 Settings -> Pages 中启用 GitHub Pages，选择包含这些文件的分支和目录。

## 本地用法

直接打开 `index.html` 后，可以通过页面左侧“导入”选择本地 `.md`、`.txt`、`.tsv` 文件。浏览器安全限制下，网页不能自动扫描你的本地文件夹。
