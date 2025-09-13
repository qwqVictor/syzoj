// API v2 - 用户相关接口
// 提供用户详情、统计、积分历史等功能

let User = syzoj.model('user');
const RatingHistory = syzoj.model('rating_history');
const RatingCalculation = syzoj.model('rating_calculation');
const Contest = syzoj.model('contest');
const ContestPlayer = syzoj.model('contest_player');
const JudgeState = syzoj.model('judge_state');
const Article = syzoj.model('article');

// 获取用户详情
app.get('/api/v2/users/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const user = await User.findById(id);
    
    if (!user) {
      return res.send({
        success: false,
        message: '无此用户。'
      });
    }

    // 加载用户相关数据
    user.ac_problems = await user.getACProblems();
    user.articles = await user.getArticles();
    user.allowedEdit = await user.isAllowedEditBy(res.locals.user);

    const statistics = await user.getStatistics();
    await user.renderInformation();
    user.emailVisible = user.public_email || user.allowedEdit;

    // 获取积分历史
    const ratingHistoryValues = await RatingHistory.find({
      where: { user_id: user.id },
      order: { rating_calculation_id: 'ASC' }
    });
    
    const ratingHistories = [{
      contestName: "初始积分",
      value: syzoj.config.default.user.rating,
      delta: null,
      rank: null,
      participants: null
    }];

    for (const history of ratingHistoryValues) {
      const ratingCalculation = await RatingCalculation.findById(history.rating_calculation_id);
      if (!ratingCalculation) continue;
      
      const contest = await Contest.findById(ratingCalculation.contest_id);
      if (!contest) continue;

      const contestPlayer = await ContestPlayer.findOne({
        where: {
          contest_id: ratingCalculation.contest_id,
          user_id: user.id
        }
      });

      const participants = await ContestPlayer.count({
        where: { contest_id: ratingCalculation.contest_id }
      });

      ratingHistories.push({
        contestName: contest.title,
        value: history.rating_after,
        delta: history.rating_after - (ratingHistories[ratingHistories.length - 1].value),
        rank: contestPlayer ? contestPlayer.score_details.rank : null,
        participants: participants
      });
    }

    res.send({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.emailVisible ? user.email : null,
          emailVisible: user.emailVisible,
          information: user.information,
          is_admin: user.is_admin,
          sex: user.sex,
          nameplate: user.nameplate,
          rating: user.rating,
          register_time: user.register_time,
          allowedEdit: user.allowedEdit,
          ac_problems: user.ac_problems,
          gravatar_url: syzoj.utils.gravatar(user.email, 1000)
        },
        statistics: statistics,
        ratingHistory: ratingHistories,
        articles: user.articles.map(article => ({
          id: article.id,
          title: article.title,
          public_time: article.public_time,
          url: syzoj.utils.makeUrl(['article', article.id])
        }))
      }
    });
  } catch (e) {
    syzoj.log(e);
    res.send({
      success: false,
      message: '获取用户详情失败',
      error: e.message
    });
  }
});

// 获取用户统计信息
app.get('/api/v2/users/:id/statistics', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const user = await User.findById(id);
    
    if (!user) {
      return res.send({
        success: false,
        message: '无此用户。'
      });
    }

    const statistics = await user.getStatistics();

    res.send({
      success: true,
      data: {
        statistics: statistics
      }
    });
  } catch (e) {
    syzoj.log(e);
    res.send({
      success: false,
      message: '获取用户统计失败',
      error: e.message
    });
  }
});

// 获取用户积分历史
app.get('/api/v2/users/:id/rating-history', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const user = await User.findById(id);
    
    if (!user) {
      return res.send({
        success: false,
        message: '无此用户。'
      });
    }

    const ratingHistoryValues = await RatingHistory.find({
      where: { user_id: user.id },
      order: { rating_calculation_id: 'ASC' }
    });
    
    const ratingHistories = [{
      contestName: "初始积分",
      value: syzoj.config.default.user.rating,
      delta: null,
      rank: null,
      participants: null,
      contest_id: null
    }];

    for (const history of ratingHistoryValues) {
      const ratingCalculation = await RatingCalculation.findById(history.rating_calculation_id);
      if (!ratingCalculation) continue;
      
      const contest = await Contest.findById(ratingCalculation.contest_id);
      if (!contest) continue;

      const contestPlayer = await ContestPlayer.findOne({
        where: {
          contest_id: ratingCalculation.contest_id,
          user_id: user.id
        }
      });

      const participants = await ContestPlayer.count({
        where: { contest_id: ratingCalculation.contest_id }
      });

      ratingHistories.push({
        contestName: contest.title,
        value: history.rating_after,
        delta: history.rating_after - (ratingHistories[ratingHistories.length - 1].value),
        rank: contestPlayer ? contestPlayer.score_details.rank : null,
        participants: participants,
        contest_id: contest.id,
        contest_url: syzoj.utils.makeUrl(['contest', contest.id])
      });
    }

    res.send({
      success: true,
      data: {
        ratingHistory: ratingHistories
      }
    });
  } catch (e) {
    syzoj.log(e);
    res.send({
      success: false,
      message: '获取积分历史失败',
      error: e.message
    });
  }
});

// 获取用户AC的题目列表
app.get('/api/v2/users/:id/ac-problems', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const user = await User.findById(id);
    
    if (!user) {
      return res.send({
        success: false,
        message: '无此用户。'
      });
    }

    const ac_problems = await user.getACProblems();

    res.send({
      success: true,
      data: {
        ac_problems: ac_problems.map(problemId => ({
          id: problemId,
          url: syzoj.utils.makeUrl(['problem', problemId])
        }))
      }
    });
  } catch (e) {
    syzoj.log(e);
    res.send({
      success: false,
      message: '获取AC题目失败',
      error: e.message
    });
  }
});

// 获取用户发表的文章
app.get('/api/v2/users/:id/articles', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const user = await User.findById(id);
    
    if (!user) {
      return res.send({
        success: false,
        message: '无此用户。'
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const where = { user_id: id };
    const total = await Article.count({ where });
    const paginate = syzoj.utils.paginate(total, page, limit);

    const articles = await Article.find({
      where,
      order: { public_time: 'DESC' },
      skip: (page - 1) * limit,
      take: limit
    });

    res.send({
      success: true,
      data: {
        articles: articles.map(article => ({
          id: article.id,
          title: article.title,
          public_time: article.public_time,
          is_notice: article.is_notice,
          problem_id: article.problem_id,
          url: syzoj.utils.makeUrl(['article', article.id])
        })),
        pagination: paginate
      }
    });
  } catch (e) {
    syzoj.log(e);
    res.send({
      success: false,
      message: '获取用户文章失败',
      error: e.message
    });
  }
});

// 获取排行榜
app.get('/api/v2/users/ranklist', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const sort = req.query.sort || syzoj.config.sorting.ranklist.field;
    const order = req.query.order || syzoj.config.sorting.ranklist.order;

    // 验证排序参数
    if (!['ac_num', 'rating', 'id', 'username'].includes(sort) || !['asc', 'desc'].includes(order)) {
      throw new ErrorMessage('错误的排序参数。');
    }

    const paginate = syzoj.utils.paginate(
      await User.countForPagination({ is_show: true }), 
      page, 
      syzoj.config.page.ranklist
    );
    
    const ranklist = await User.queryPage(paginate, { is_show: true }, { 
      [sort]: order.toUpperCase() 
    });
    
    await ranklist.forEachAsync(async x => await x.renderInformation());

    res.send({
      success: true,
      data: {
        ranklist: ranklist.map(user => ({
          id: user.id,
          username: user.username,
          nameplate: user.nameplate,
          information: user.information,
          rating: user.rating,
          ac_num: user.ac_num,
          url: syzoj.utils.makeUrl(['user', user.id])
        })),
        pagination: paginate,
        sorting: {
          field: sort,
          order: order
        }
      }
    });
  } catch (e) {
    syzoj.log(e);
    res.send({
      success: false,
      message: '获取排行榜失败',
      error: e.message
    });
  }
});
