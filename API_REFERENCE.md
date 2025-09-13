# SYZOJ API v2 参考文档

本文档描述了SYZOJ系统中新实现的API v2接口，用于支持前后端分离架构。

## 基础信息

- **基础URL**: `/api/v2`
- **响应格式**: JSON
- **字符编码**: UTF-8

## 统一响应格式

所有API接口都使用以下统一的响应格式：

```json
{
  "success": true,
  "data": {
    // 实际数据内容
  },
  "message": "操作成功" // 可选，错误时必有
}
```

成功时：
- `success`: `true`
- `data`: 包含实际数据
- `message`: 可选的成功消息

失败时：
- `success`: `false`
- `message`: 错误描述
- `error`: 可选的详细错误信息

## API接口列表

### 1. 系统配置API

#### 获取编程语言配置
```
GET /api/v2/config/languages
```
返回系统支持的编程语言及其配置信息。

#### 获取评测状态列表
```
GET /api/v2/config/judge-status
```
返回所有可能的评测状态及其图标配置。

#### 获取站点基本信息
```
GET /api/v2/config/site-info
```
返回站点标题、当前用户信息等基本配置。

#### 获取系统统计信息
```
GET /api/v2/config/statistics
```
返回用户数、题目数、提交数等统计信息。

### 2. 首页数据API

#### 获取首页完整数据
```
GET /api/v2/home/dashboard
```
一次性获取首页展示的所有数据，包括公告、排行榜、最近题目、近期比赛等。

#### 获取公告列表
```
GET /api/v2/home/notices
```
获取系统公告列表。

#### 获取首页排行榜
```
GET /api/v2/home/ranklist?limit=10
```
获取首页显示的用户排行榜。

参数：
- `limit`: 返回条数，默认为配置值

#### 获取最近更新题目
```
GET /api/v2/home/recent-problems?limit=5
```
获取最近公开的题目列表。

#### 获取近期比赛
```
GET /api/v2/home/recent-contests?limit=5
```
获取近期的比赛列表。

#### 获取今日运势
```
GET /api/v2/home/fortune
```
获取当前用户的今日运势（需要登录）。

#### 获取友情链接
```
GET /api/v2/home/links
```
获取配置的友情链接列表。

### 3. 题目相关API

#### 获取题目列表
```
GET /api/v2/problems?page=1&sort=id&order=asc&keyword=&tag=
```
获取题目列表，支持分页、排序和筛选。

参数：
- `page`: 页码，默认1
- `sort`: 排序字段 (id, title, ac_num, submit_num, ac_rate)
- `order`: 排序方向 (asc, desc)
- `keyword`: 搜索关键词
- `tag`: 标签ID，多个用逗号分隔

#### 获取题目详情
```
GET /api/v2/problems/:id?contest_id=
```
获取指定题目的详细信息。

参数：
- `contest_id`: 可选，如果在比赛中查看题目

#### 获取题目统计
```
GET /api/v2/problems/:id/statistics?type=fastest
```
获取题目的统计信息，如最快解答、最短代码等。

参数：
- `type`: 统计类型 (fastest, shortest, earliest)

#### 获取题目标签
```
GET /api/v2/problems/tags
```
获取所有题目标签列表。

### 4. 用户相关API

#### 获取用户详情
```
GET /api/v2/users/:id
```
获取指定用户的详细信息，包括统计、积分历史、文章等。

#### 获取用户统计
```
GET /api/v2/users/:id/statistics
```
获取用户的提交统计信息。

#### 获取积分历史
```
GET /api/v2/users/:id/rating-history
```
获取用户的积分变化历史。

#### 获取AC题目
```
GET /api/v2/users/:id/ac-problems
```
获取用户已通过的题目列表。

#### 获取用户文章
```
GET /api/v2/users/:id/articles?page=1&limit=10
```
获取用户发表的文章列表。

#### 获取用户排行榜
```
GET /api/v2/users/ranklist?page=1&sort=rating&order=desc
```
获取用户排行榜。

### 5. 提交记录API

#### 获取提交记录列表
```
GET /api/v2/submissions?page=1&problem_id=&submitter=&language=&status=&min_score=&max_score=&contest=
```
获取提交记录列表，支持多种筛选条件。

参数：
- `page`: 页码
- `problem_id`: 题目ID
- `submitter`: 提交者用户名
- `language`: 编程语言
- `status`: 评测状态
- `min_score`, `max_score`: 分数范围
- `contest`: 比赛ID

#### 获取提交详情
```
GET /api/v2/submissions/:id
```
获取指定提交的详细信息，包括代码、测试结果等。

#### 获取显示配置
```
GET /api/v2/submissions/config?contest_id=
```
获取提交记录页面的显示配置。

### 6. 比赛相关API

#### 获取比赛列表
```
GET /api/v2/contests?page=1
```
获取比赛列表。

#### 获取比赛详情
```
GET /api/v2/contests/:id
```
获取指定比赛的详细信息。

#### 获取比赛题目
```
GET /api/v2/contests/:id/problems
```
获取比赛中的题目列表。

#### 获取比赛排行榜
```
GET /api/v2/contests/:id/ranklist
```
获取比赛排行榜。

#### 获取比赛提交记录
```
GET /api/v2/contests/:id/submissions
```
获取比赛的提交记录（重定向到通用提交记录API）。

### 7. 讨论相关API

#### 获取讨论列表
```
GET /api/v2/discussions?type=global&page=1
```
获取讨论列表。

参数：
- `type`: 讨论类型 (global, problems)
- `page`: 页码

#### 获取题目讨论
```
GET /api/v2/discussions/problems/:problemId?page=1
```
获取特定题目的讨论列表。

#### 获取文章详情
```
GET /api/v2/articles/:id?page=1
```
获取文章详情及其评论。

#### 获取文章评论
```
GET /api/v2/articles/:id/comments?page=1
```
获取文章的评论列表。

#### 获取最新文章
```
GET /api/v2/articles/recent?limit=10&type=all
```
获取最新发表的文章。

参数：
- `limit`: 返回条数
- `type`: 文章类型 (notice, normal, all)

## 错误代码

常见的错误响应：

- **400 Bad Request**: 请求参数错误
- **401 Unauthorized**: 需要登录
- **403 Forbidden**: 权限不足
- **404 Not Found**: 资源不存在
- **500 Internal Server Error**: 服务器内部错误

## 认证

大部分API接口不需要认证即可访问，但某些功能（如查看个人信息、提交代码等）需要用户登录。

登录状态通过session维护，前端需要正确处理cookie。

## 分页

支持分页的接口会返回以下分页信息：

```json
{
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5,
    "hasPrev": false,
    "hasNext": true
  }
}
```

## 测试

使用提供的测试脚本验证API接口：

```bash
node test_apis.js http://localhost:5283
```

## 注意事项

1. 所有时间戳都是Unix时间戳（秒）
2. HTML内容已经过markdown渲染，可以直接显示
3. URL字段提供了完整的页面链接
4. 权限控制与原系统保持一致
5. 某些接口在比赛期间可能有特殊的访问限制
