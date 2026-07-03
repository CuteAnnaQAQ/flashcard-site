# 数据结构

## STL容器常用语法

### 数组

问题 | 答案 | 标签

vector删除的语法 |  num.erase(num.begin()+index)

求数组最大值? | ranges::max(num)

## 常用库函数

问题 | 答案 | 标签

二分法的两个函数的用法? |

[]lower,upper),左闭右开，lower找第一个大于等于的，upper找第一个大于的。

 lower_bound(num.begin(),num.end(),target),

upper_bound(num.begin(),num.end(),target)，

返回的都是迭代器，要求index可以用 ranges::lower_bund()-nu,.begin()求相对位置
