// API v2 - 首页数据相关接口
// 提供首页展示所需的各种数据

let User = syzoj.model('user');
let Article = syzoj.model('article');
let Contest = syzoj.model('contest');
let Problem = syzoj.model('problem');
let Divine = syzoj.lib('divine');
let TimeAgo = require('javascript-time-ago');
let zh = require('../libs/timeago');
TimeAgo.locale(zh);
const timeAgo = new TimeAgo('zh-CN');

// 获取首页完整数据
app.get('/api/v2/home/dashboard', async (req, res) => {
  try {
    // 并行获取各种数据
    const [ranklist, notices, contests, problems, fortune] = await Promise.all([
      // 排行榜
      User.queryRange([1, syzoj.config.page.ranklist_index], { is_show: true }, {
        [syzoj.config.sorting.ranklist.field]: syzoj.config.sorting.ranklist.order
      }),
      
      // 公告
      Article.find({
        where: { is_notice: true }, 
        order: { public_time: 'DESC' }
      }),
      
      // 近期比赛
      Contest.queryRange([1, 5], { is_public: true }, {
        start_time: 'DESC'
      }),
      
      // 最近更新的题目
      Problem.queryRange([1, 5], { is_public: true }, {
        publicize_time: 'DESC'
      }),
      
      // 今日运势（如果用户已登录且启用）
      (res.locals.user && syzoj.config.divine) ? 
        Divine(res.locals.user.username, res.locals.user.sex) : null
    ]);

    // 处理排行榜数据
    await ranklist.forEachAsync(async x => await x.renderInformation());

    // 处理公告数据
    const processedNotices = notices.map(article => ({
      title: article.title,
      url: syzoj.utils.makeUrl(['article', article.id]),
      date: syzoj.utils.formatDate(article.public_time, 'L')
    }));

    // 处理题目数据
    const processedProblems = problems.map(problem => ({
      id: problem.id,
      title: problem.title,
      time: timeAgo.format(new Date(problem.publicize_time))
    }));

    // 处理比赛数据
    const processedContests = await Promise.all(contests.map(async contest => {
      const now = syzoj.utils.getCurrentDate();
      let status = '';
      if (now < contest.start_time) {
        status = '未开始';
      } else if (now >= contest.start_time && now < contest.end_time) {
        status = '进行中';
      } else {
        status = '已结束';
      }

      return {
        id: contest.id,
        title: contest.title,
        start_time: contest.start_time,
        end_time: contest.end_time,
        formatted_start_time: syzoj.utils.formatDate(contest.start_time),
        status: status,
        url: syzoj.utils.makeUrl(['contest', contest.id])
      };
    }));

    res.send({
      success: true,
      data: {
        notices: processedNotices,
        ranklist: ranklist.map(user => ({
          id: user.id,
          username: user.username,
          nameplate: user.nameplate,
          information: user.information,
          rating: user.rating,
          url: syzoj.utils.makeUrl(['user', user.id])
        })),
        recentProblems: processedProblems,
        recentContests: processedContests,
        fortune: fortune,
        links: syzoj.config.links || []
      }
    });
  } catch (e) {
    syzoj.log(e);
    res.send({
      success: false,
      message: '获取首页数据失败',
      error: e.message
    });
  }
});

// 获取公告列表
app.get('/api/v2/home/notices', async (req, res) => {
  try {
    const notices = await Article.find({
      where: { is_notice: true }, 
      order: { public_time: 'DESC' }
    });

    const processedNotices = notices.map(article => ({
      id: article.id,
      title: article.title,
      url: syzoj.utils.makeUrl(['article', article.id]),
      date: syzoj.utils.formatDate(article.public_time, 'L'),
      public_time: article.public_time
    }));

    res.send({
      success: true,
      data: {
        notices: processedNotices
      }
    });
  } catch (e) {
    syzoj.log(e);
    res.send({
      success: false,
      message: '获取公告失败',
      error: e.message
    });
  }
});

// 获取排行榜
app.get('/api/v2/home/ranklist', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || syzoj.config.page.ranklist_index;
    const ranklist = await User.queryRange([1, limit], { is_show: true }, {
      [syzoj.config.sorting.ranklist.field]: syzoj.config.sorting.ranklist.order
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
          url: syzoj.utils.makeUrl(['user', user.id])
        }))
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

// 获取最近更新的题目
app.get('/api/v2/home/recent-problems', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const problems = await Problem.queryRange([1, limit], { is_public: true }, {
      publicize_time: 'DESC'
    });

    const processedProblems = problems.map(problem => ({
      id: problem.id,
      title: problem.title,
      time: timeAgo.format(new Date(problem.publicize_time)),
      publicize_time: problem.publicize_time,
      url: syzoj.utils.makeUrl(['problem', problem.id])
    }));

    res.send({
      success: true,
      data: {
        problems: processedProblems
      }
    });
  } catch (e) {
    syzoj.log(e);
    res.send({
      success: false,
      message: '获取最近题目失败',
      error: e.message
    });
  }
});

// 获取近期比赛
app.get('/api/v2/home/recent-contests', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    let where;
    if (res.locals.user && res.locals.user.is_admin) {
      where = {};
    } else {
      where = { is_public: true };
    }

    const contests = await Contest.queryRange([1, limit], where, {
      start_time: 'DESC'
    });

    const processedContests = await Promise.all(contests.map(async contest => {
      const now = syzoj.utils.getCurrentDate();
      let status = '';
      if (now < contest.start_time) {
        status = '未开始';
      } else if (now >= contest.start_time && now < contest.end_time) {
        status = '进行中';
      } else {
        status = '已结束';
      }

      return {
        id: contest.id,
        title: contest.title,
        start_time: contest.start_time,
        end_time: contest.end_time,
        formatted_start_time: syzoj.utils.formatDate(contest.start_time),
        status: status,
        is_public: contest.is_public,
        url: syzoj.utils.makeUrl(['contest', contest.id])
      };
    }));

    res.send({
      success: true,
      data: {
        contests: processedContests
      }
    });
  } catch (e) {
    syzoj.log(e);
    res.send({
      success: false,
      message: '获取近期比赛失败',
      error: e.message
    });
  }
});

// 获取今日运势
app.get('/api/v2/home/fortune', async (req, res) => {
  try {
    if (!res.locals.user) {
      return res.send({
        success: false,
        message: '需要登录才能查看今日运势'
      });
    }

    if (!syzoj.config.divine) {
      return res.send({
        success: false,
        message: '今日运势功能未启用'
      });
    }

    const fortune = Divine(res.locals.user.username, res.locals.user.sex);

    res.send({
      success: true,
      data: {
        fortune: fortune
      }
    });
  } catch (e) {
    syzoj.log(e);
    res.send({
      success: false,
      message: '获取今日运势失败',
      error: e.message
    });
  }
});

// 获取友情链接
app.get('/api/v2/home/links', async (req, res) => {
  try {
    res.send({
      success: true,
      data: {
        links: syzoj.config.links || []
      }
    });
  } catch (e) {
    syzoj.log(e);
    res.send({
      success: false,
      message: '获取友情链接失败',
      error: e.message
    });
  }
});
