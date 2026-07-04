# Deckfile

这是一个静态 Anki 风格复习网页。

卡片数据用 Markdown 保存，网页端直接解析。

## 数据格式

推荐使用三字段格式：

```markdown
# 线性代数

问题 | 答案 | 标签
什么是零矩阵？ | 所有元素都为 0 的矩阵。 | 数学::线性代数::矩阵
```

也支持 TSV：

```tsv
问题	答案	标签
什么是零矩阵？	所有元素都为 0 的矩阵。	数学::线性代数::矩阵
```

字段内可以使用常见 HTML，例如 `<b>`、`<code>`、`<ul><li>`。

Markdown 标题会作为页面里的“小分组”。例如 `# 线性代数` 下面的所有卡片都会归入“线性代数”分组，直到遇到下一个标题。

### 多行答案

如果答案需要换行，可以把第一行写成 `问题 |`，后面的连续内容都会并入这张卡片的答案，直到遇到下一张卡片、下一个标题，或文件结束：

```markdown
二分法的两个函数的用法? |

lower_bound 找第一个大于等于 target 的位置。

upper_bound 找第一个大于 target 的位置。

返回值都是迭代器。
```

代码块也可以直接放在多行答案里：

````markdown
二叉树的最近公共祖先怎么求？ | 通过递归查找：

```cpp
TreeNode* lowestCommonAncestor(TreeNode* root, TreeNode* p, TreeNode* q) {
    if (!root || root == p || root == q) return root;
    TreeNode* left = lowestCommonAncestor(root->left, p, q);
    TreeNode* right = lowestCommonAncestor(root->right, p, q);
    return left && right ? root : (left ? left : right);
}
```
````

## LaTeX 公式

页面使用 MathJax 渲染公式，后续公式建议直接写 LaTeX：

```markdown
问题 | 答案 | 标签
贝叶斯定理？ | $P(A\mid B)=\frac{P(B\mid A)P(A)}{P(B)}$ | 数学::概率论
正态分布密度函数？ | $$f(x)=\frac{1}{\sigma\sqrt{2\pi}}e^{-\frac{(x-\mu)^2}{2\sigma^2}}$$ | 数学::概率论
```

支持：

- 行内公式：`$...$` 或 `\(...\)`
- 独立公式：`$$...$$` 或 `\[...\]`

如果公式里需要条件竖线，建议写 `\mid`，例如 `$P(A\mid B)$`，避免和卡片字段分隔符 ` | ` 混淆。

## 文件树

牌组按 `cards/` 下的文件路径显示为树：

```text
cards/
  math/
    math-ko.md
  demo/
    math-demo.md
```

对应的 `cards/index.json`：

```json
{
  "decks": [
    {"name": "高数 概率论 线性代数", "file": "math/math-ko.md"},
    {"name": "数学示例", "file": "demo/math-demo.md"}
  ]
}
```

## GitHub Pages 用法

1. 把这个 `flashcard-site` 目录提交到 GitHub 仓库。
2. 将 Markdown 卡片按目录放入 `cards/`。
3. 在 `cards/index.json` 中登记文件：

```json
{
  "decks": [
    {"name": "数学", "file": "math/math.md"}
  ]
}
```

4. 在仓库 Settings -> Pages 中启用 GitHub Pages，选择包含这些文件的分支和目录。

## 本地用法

直接打开 `index.html` 后，可以通过页面左侧“导入”选择本地 `.md`、`.txt`、`.tsv` 文件。浏览器安全限制下，网页不能自动扫描你的本地文件夹。
