// API v2 - 讨论相关接口
// 提供讨论列表、文章详情、评论等功能

let Problem = syzoj.model('problem');
let Article = syzoj.model('article');
let ArticleComment = syzoj.model('article-comment');
let User = syzoj.model('user');

// 获取讨论列表
app.get('/api/v2/discussions', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const type = req.query.type || 'global'; // global, problems
    
    if (!['global', 'problems'].includes(type)) {
      return res.send({
        success: false,
        message: '无效的讨论类型。'
      });
    }

    const in_problems = type === 'problems';

    let where;
    if (in_problems) {
      where = { problem_id: TypeORM.Not(TypeORM.IsNull()) };
    } else {
      where = { problem_id: null };
    }

    const paginate = syzoj.utils.paginate(
      await Article.countForPagination(where), 
      page, 
      syzoj.config.page.discussion
    );
    
    const articles = await Article.queryPage(paginate, where, {
      sort_time: 'DESC'
    });

    // 加载相关数据
    const processedArticles = await Promise.all(articles.map(async article => {
      await article.loadRelationships();
      
      const articleData = {
        id: article.id,
        title: article.title,
        user: {
          id: article.user.id,
          username: article.user.username,
          url: syzoj.utils.makeUrl(['user', article.user.id])
        },
        public_time: article.public_time,
        sort_time: article.sort_time,
        formatted_time: syzoj.utils.formatDate(article.sort_time),
        is_notice: article.is_notice,
        url: syzoj.utils.makeUrl(['article', article.id])
      };

      if (in_problems && article.problem_id) {
        const problem = await Problem.findById(article.problem_id);
        if (problem) {
          articleData.problem = {
            id: problem.id,
            title: problem.title,
            url: syzoj.utils.makeUrl(['problem', problem.id])
          };
        }
      }

      return articleData;
    }));

    res.send({
      success: true,
      data: {
        articles: processedArticles,
        pagination: paginate,
        problem: null,
        in_problems: in_problems,
        type: type
      }
    });
  } catch (e) {
    syzoj.log(e);
    res.send({
      success: false,
      message: '获取讨论列表失败',
      error: e.message
    });
  }
});

// 获取特定题目的讨论
app.get('/api/v2/discussions/problems/:problemId', async (req, res) => {
  try {
    const problemId = parseInt(req.params.problemId);
    const page = parseInt(req.query.page) || 1;

    const problem = await Problem.findById(problemId);
    if (!problem) {
      return res.send({
        success: false,
        message: '无此题目。'
      });
    }

    if (!await problem.isAllowedUseBy(res.locals.user)) {
      return res.send({
        success: false,
        message: '您没有权限访问此题目的讨论。'
      });
    }

    const where = { problem_id: problemId };
    const paginate = syzoj.utils.paginate(
      await Article.countForPagination(where), 
      page, 
      syzoj.config.page.discussion
    );
    
    const articles = await Article.queryPage(paginate, where, {
      sort_time: 'DESC'
    });

    // 加载相关数据
    const processedArticles = await Promise.all(articles.map(async article => {
      await article.loadRelationships();
      
      return {
        id: article.id,
        title: article.title,
        user: {
          id: article.user.id,
          username: article.user.username,
          url: syzoj.utils.makeUrl(['user', article.user.id])
        },
        public_time: article.public_time,
        sort_time: article.sort_time,
        formatted_time: syzoj.utils.formatDate(article.sort_time),
        is_notice: article.is_notice,
        url: syzoj.utils.makeUrl(['article', article.id])
      };
    }));

    res.send({
      success: true,
      data: {
        articles: processedArticles,
        pagination: paginate,
        problem: {
          id: problem.id,
          title: problem.title,
          url: syzoj.utils.makeUrl(['problem', problem.id])
        },
        in_problems: false
      }
    });
  } catch (e) {
    syzoj.log(e);
    res.send({
      success: false,
      message: '获取题目讨论失败',
      error: e.message
    });
  }
});

// 获取文章详情
app.get('/api/v2/articles/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const article = await Article.findById(id);
    
    if (!article) {
      return res.send({
        success: false,
        message: '无此帖子。'
      });
    }

    await article.loadRelationships();
    article.allowedEdit = await article.isAllowedEditBy(res.locals.user);
    article.allowedComment = await article.isAllowedCommentBy(res.locals.user);
    
    // 渲染文章内容
    const content = await syzoj.utils.markdown(article.content);

    // 获取评论
    const page = parseInt(req.query.page) || 1;
    const where = { article_id: id };
    const commentsCount = await ArticleComment.countForPagination(where);
    const paginate = syzoj.utils.paginate(commentsCount, page, syzoj.config.page.article_comment);

    const comments = await ArticleComment.queryPage(paginate, where, {
      public_time: 'DESC'
    });

    // 处理评论数据
    const processedComments = await Promise.all(comments.map(async comment => {
      const commentContent = await syzoj.utils.markdown(comment.content);
      comment.allowedEdit = await comment.isAllowedEditBy(res.locals.user);
      await comment.loadRelationships();

      return {
        id: comment.id,
        content: commentContent,
        user: {
          id: comment.user.id,
          username: comment.user.username,
          url: syzoj.utils.makeUrl(['user', comment.user.id])
        },
        public_time: comment.public_time,
        formatted_time: syzoj.utils.formatDate(comment.public_time),
        allowedEdit: comment.allowedEdit
      };
    }));

    // 获取关联的题目信息（如果有）
    let problem = null;
    if (article.problem_id) {
      const problemObj = await Problem.findById(article.problem_id);
      if (problemObj) {
        problem = {
          id: problemObj.id,
          title: problemObj.title,
          url: syzoj.utils.makeUrl(['problem', problemObj.id])
        };
      }
    }

    res.send({
      success: true,
      data: {
        article: {
          id: article.id,
          title: article.title,
          content: content,
          user: {
            id: article.user.id,
            username: article.user.username,
            url: syzoj.utils.makeUrl(['user', article.user.id])
          },
          public_time: article.public_time,
          sort_time: article.sort_time,
          formatted_time: syzoj.utils.formatDate(article.public_time),
          is_notice: article.is_notice,
          allowedEdit: article.allowedEdit,
          allowedComment: article.allowedComment,
          problem: problem
        },
        comments: processedComments,
        pagination: paginate,
        commentsCount: commentsCount
      }
    });
  } catch (e) {
    syzoj.log(e);
    res.send({
      success: false,
      message: '获取文章详情失败',
      error: e.message
    });
  }
});

// 获取文章的评论列表
app.get('/api/v2/articles/:id/comments', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const page = parseInt(req.query.page) || 1;

    const article = await Article.findById(id);
    if (!article) {
      return res.send({
        success: false,
        message: '无此帖子。'
      });
    }

    const where = { article_id: id };
    const commentsCount = await ArticleComment.countForPagination(where);
    const paginate = syzoj.utils.paginate(commentsCount, page, syzoj.config.page.article_comment);

    const comments = await ArticleComment.queryPage(paginate, where, {
      public_time: 'ASC' // 评论按时间正序排列
    });

    // 处理评论数据
    const processedComments = await Promise.all(comments.map(async comment => {
      const commentContent = await syzoj.utils.markdown(comment.content);
      comment.allowedEdit = await comment.isAllowedEditBy(res.locals.user);
      await comment.loadRelationships();

      return {
        id: comment.id,
        content: commentContent,
        user: {
          id: comment.user.id,
          username: comment.user.username,
          url: syzoj.utils.makeUrl(['user', comment.user.id])
        },
        public_time: comment.public_time,
        formatted_time: syzoj.utils.formatDate(comment.public_time),
        allowedEdit: comment.allowedEdit
      };
    }));

    res.send({
      success: true,
      data: {
        comments: processedComments,
        pagination: paginate,
        commentsCount: commentsCount,
        article: {
          id: article.id,
          title: article.title
        }
      }
    });
  } catch (e) {
    syzoj.log(e);
    res.send({
      success: false,
      message: '获取评论列表失败',
      error: e.message
    });
  }
});

// 获取最新文章/公告
app.get('/api/v2/articles/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const type = req.query.type; // notice, normal, all

    let where = {};
    if (type === 'notice') {
      where.is_notice = true;
    } else if (type === 'normal') {
      where.is_notice = false;
    }

    const articles = await Article.find({
      where,
      order: { public_time: 'DESC' },
      take: limit
    });

    const processedArticles = await Promise.all(articles.map(async article => {
      await article.loadRelationships();
      
      const articleData = {
        id: article.id,
        title: article.title,
        user: {
          id: article.user.id,
          username: article.user.username,
          url: syzoj.utils.makeUrl(['user', article.user.id])
        },
        public_time: article.public_time,
        formatted_time: syzoj.utils.formatDate(article.public_time),
        is_notice: article.is_notice,
        url: syzoj.utils.makeUrl(['article', article.id])
      };

      if (article.problem_id) {
        const problem = await Problem.findById(article.problem_id);
        if (problem) {
          articleData.problem = {
            id: problem.id,
            title: problem.title,
            url: syzoj.utils.makeUrl(['problem', problem.id])
          };
        }
      }

      return articleData;
    }));

    res.send({
      success: true,
      data: {
        articles: processedArticles,
        type: type || 'all',
        limit: limit
      }
    });
  } catch (e) {
    syzoj.log(e);
    res.send({
      success: false,
      message: '获取最新文章失败',
      error: e.message
    });
  }
});
