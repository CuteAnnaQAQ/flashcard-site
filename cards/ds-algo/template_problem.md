问题 | 答案 | 标签

二叉树的最近公共祖先怎么求？ | 通过递归查找，

```C++
class Solution {
public:
    TreeNode* lowestCommonAncestor(TreeNode* root, TreeNode* p, TreeNode* q) {
        if(!root||root==p||root==q)return root;
        TreeNode* l = lowestCommonAncestor(root->left,p,q);
        TreeNode* r = lowestCommonAncestor(root->right,p,q);
        if(l!=nullptr&&r!=nullptr)return root;
        if(l!=nullptr)return l;
        if(r!=nullptr)return r;
        return nullptr; 
    
    }
};
```
