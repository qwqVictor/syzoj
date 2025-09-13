// API v2 - 比赛相关接口
// 提供比赛列表、详情、排行榜等功能

let Contest = syzoj.model('contest');
let ContestRanklist = syzoj.model('contest_ranklist');
let ContestPlayer = syzoj.model('contest_player');
let Problem = syzoj.model('problem');
let JudgeState = syzoj.model('judge_state');
let User = syzoj.model('user');

const { getSubmissionInfo, getRoughResult, processOverallResult } = require('../libs/submissions_process');

// 获取比赛列表
app.get('/api/v2/contests', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    
    let where;
    if (res.locals.user && res.locals.user.is_admin) {
      where = {};
    } else {
      where = { is_public: true };
    }

    const paginate = syzoj.utils.paginate(
      await Contest.countForPagination(where), 
      page, 
      syzoj.config.page.contest
    );
    
    const contests = await Contest.queryPage(paginate, where, {
      start_time: 'DESC'
    });

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
        subtitle: await syzoj.utils.markdown(contest.subtitle),
        start_time: contest.start_time,
        end_time: contest.end_time,
        formatted_start_time: syzoj.utils.formatDate(contest.start_time),
        formatted_end_time: syzoj.utils.formatDate(contest.end_time),
        is_public: contest.is_public,
        running: contest.isRunning(),
        ended: contest.isEnded(),
        status: status,
        type: contest.type,
        url: syzoj.utils.makeUrl(['contest', contest.id])
      };
    }));

    res.send({
      success: true,
      data: {
        contests: processedContests,
        pagination: paginate
      }
    });
  } catch (e) {
    syzoj.log(e);
    res.send({
      success: false,
      message: '获取比赛列表失败',
      error: e.message
    });
  }
});

// 获取比赛详情
app.get('/api/v2/contests/:id', async (req, res) => {
  try {
    const curUser = res.locals.user;
    const contest_id = parseInt(req.params.id);

    const contest = await Contest.findById(contest_id);
    if (!contest) {
      return res.send({
        success: false,
        message: '无此比赛。'
      });
    }

    const isSupervisior = await contest.isSupervisior(curUser);

    // 权限检查
    if (!contest.is_public && (!res.locals.user || (!res.locals.user.is_admin && !contest.admins.includes(res.locals.user.id.toString())))) {
      return res.send({
        success: false,
        message: '比赛未公开，请耐心等待 (´∀ `)'
      });
    }

    contest.running = contest.isRunning();
    contest.ended = contest.isEnded();
    contest.subtitle = await syzoj.utils.markdown(contest.subtitle);
    contest.information = await syzoj.utils.markdown(contest.information);

    // 获取题目列表
    const problems_id = await contest.getProblems();
    const problems = await Promise.all(problems_id.map(async id => await Problem.findById(id)));

    const processedProblems = await Promise.all(problems.map(async (problem, index) => {
      const problemData = {
        id: problem.id,
        title: problem.title,
        alpha: String.fromCharCode('A'.charCodeAt(0) + index),
        ac_num: 0,
        submit_num: 0,
        url: syzoj.utils.makeUrl(['contest', contest.id, index + 1])
      };

      // 获取比赛中的统计数据
      if (contest.type === 'ioi' || contest.type === 'noi' || contest.ended) {
        const submissions = await JudgeState.find({
          where: {
            type: 1,
            type_info: contest.id,
            problem_id: problem.id
          }
        });

        problemData.submit_num = submissions.length;
        problemData.ac_num = submissions.filter(s => s.status === 'Accepted').length;
      }

      return problemData;
    }));

    // 获取当前用户的参赛信息
    let player = null;
    if (curUser) {
      const contestPlayer = await ContestPlayer.findOne({
        where: {
          contest_id: contest.id,
          user_id: curUser.id
        }
      });

      if (contestPlayer) {
        player = {
          score: contestPlayer.score,
          rank: contestPlayer.score_details.rank || null
        };
      }
    }

    // 获取管理员信息
    let admins = [];
    if (contest.admins) {
      const adminIds = contest.admins.split('|').filter(id => id);
      admins = await Promise.all(adminIds.map(async id => {
        const admin = await User.findById(parseInt(id));
        return admin ? {
          id: admin.id,
          username: admin.username
        } : null;
      }));
      admins = admins.filter(admin => admin !== null);
    }

    res.send({
      success: true,
      data: {
        contest: {
          id: contest.id,
          title: contest.title,
          subtitle: contest.subtitle,
          information: contest.information,
          start_time: contest.start_time,
          end_time: contest.end_time,
          formatted_start_time: syzoj.utils.formatDate(contest.start_time),
          formatted_end_time: syzoj.utils.formatDate(contest.end_time),
          is_public: contest.is_public,
          running: contest.running,
          ended: contest.ended,
          type: contest.type,
          hide_statistics: contest.hide_statistics,
          admins: admins,
          isSupervisior: isSupervisior
        },
        problems: processedProblems,
        player: player
      }
    });
  } catch (e) {
    syzoj.log(e);
    res.send({
      success: false,
      message: '获取比赛详情失败',
      error: e.message
    });
  }
});

// 获取比赛题目列表
app.get('/api/v2/contests/:id/problems', async (req, res) => {
  try {
    const contest_id = parseInt(req.params.id);
    const contest = await Contest.findById(contest_id);
    
    if (!contest) {
      return res.send({
        success: false,
        message: '无此比赛。'
      });
    }

    // 权限检查
    if (!contest.is_public && (!res.locals.user || (!res.locals.user.is_admin && !contest.admins.includes(res.locals.user.id.toString())))) {
      return res.send({
        success: false,
        message: '比赛未公开，请耐心等待。'
      });
    }

    const problems_id = await contest.getProblems();
    const problems = await Promise.all(problems_id.map(async id => await Problem.findById(id)));

    const processedProblems = problems.map((problem, index) => ({
      id: problem.id,
      title: problem.title,
      alpha: String.fromCharCode('A'.charCodeAt(0) + index),
      index: index + 1,
      url: syzoj.utils.makeUrl(['contest', contest.id, index + 1])
    }));

    res.send({
      success: true,
      data: {
        problems: processedProblems,
        contest: {
          id: contest.id,
          title: contest.title,
          running: contest.isRunning(),
          ended: contest.isEnded()
        }
      }
    });
  } catch (e) {
    syzoj.log(e);
    res.send({
      success: false,
      message: '获取比赛题目失败',
      error: e.message
    });
  }
});

// 获取比赛排行榜
app.get('/api/v2/contests/:id/ranklist', async (req, res) => {
  try {
    const contest_id = parseInt(req.params.id);
    const contest = await Contest.findById(contest_id);
    
    if (!contest) {
      return res.send({
        success: false,
        message: '无此比赛。'
      });
    }

    await contest.loadRelationships();

    // 权限检查
    if (!contest.is_public && (!res.locals.user || (!res.locals.user.is_admin && !contest.admins.includes(res.locals.user.id.toString())))) {
      return res.send({
        success: false,
        message: '比赛未公开，请耐心等待。'
      });
    }

    if (!contest.isEnded() && contest.hide_statistics && (!res.locals.user || !await contest.isSupervisior(res.locals.user))) {
      return res.send({
        success: false,
        message: '比赛期间排行榜不可见。'
      });
    }

    await contest.ranklist.loadRelationships();
    const ranklist = contest.ranklist.ranklist;

    res.send({
      success: true,
      data: {
        ranklist: ranklist,
        contest: {
          id: contest.id,
          title: contest.title,
          type: contest.type,
          running: contest.isRunning(),
          ended: contest.isEnded(),
          hide_statistics: contest.hide_statistics
        }
      }
    });
  } catch (e) {
    syzoj.log(e);
    res.send({
      success: false,
      message: '获取比赛排行榜失败',
      error: e.message
    });
  }
});

// 获取比赛提交记录
app.get('/api/v2/contests/:id/submissions', async (req, res) => {
  try {
    const contest_id = parseInt(req.params.id);
    const contest = await Contest.findById(contest_id);
    
    if (!contest) {
      return res.send({
        success: false,
        message: '无此比赛。'
      });
    }

    const curUser = res.locals.user;
    const isSupervisior = await contest.isSupervisior(curUser);

    // 权限检查
    if (!contest.isEnded() && !isSupervisior) {
      return res.send({
        success: false,
        message: '比赛未结束，无法查看提交记录。'
      });
    }

    // 重定向到通用提交记录API，添加比赛参数
    const queryParams = new URLSearchParams(req.query);
    queryParams.set('contest', contest_id.toString());

    res.redirect(`/api/v2/submissions?${queryParams.toString()}`);
  } catch (e) {
    syzoj.log(e);
    res.send({
      success: false,
      message: '获取比赛提交记录失败',
      error: e.message
    });
  }
});
