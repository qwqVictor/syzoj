// API v2 - 提交记录相关接口
// 提供提交列表、详情等功能

let JudgeState = syzoj.model('judge_state');
let FormattedCode = syzoj.model('formatted_code');
let User = syzoj.model('user');
let Contest = syzoj.model('contest');
let Problem = syzoj.model('problem');

const { getSubmissionInfo, getRoughResult, processOverallResult } = require('../libs/submissions_process');

// 获取提交记录列表
app.get('/api/v2/submissions', async (req, res) => {
  try {
    const curUser = res.locals.user;
    const page = parseInt(req.query.page) || 1;

    let query = JudgeState.createQueryBuilder();
    let isFiltered = false;
    let inContest = false;
    let contest = null;

    // 用户筛选
    const submitterName = req.query.submitter;
    if (submitterName) {
      const user = await User.fromName(submitterName);
      if (user) {
        query.andWhere('user_id = :user_id', { user_id: user.id });
        isFiltered = true;
      } else {
        query.andWhere('user_id = :user_id', { user_id: 0 });
        isFiltered = true;
      }
    }

    // 比赛筛选
    if (!req.query.contest) {
      query.andWhere('type = 0');
    } else {
      const contestId = Number(req.query.contest);
      contest = await Contest.findById(contestId);
      if (contest) {
        contest.ended = contest.isEnded();
        if ((contest.ended && contest.is_public) || 
            (curUser && await contest.isSupervisior(curUser))) {
          query.andWhere('type = 1');
          query.andWhere('type_info = :type_info', { type_info: contestId });
          inContest = true;
        } else {
          return res.send({
            success: false,
            message: '您暂时无权查看此比赛的详细评测信息。'
          });
        }
      }
    }

    // 分数筛选
    let minScore = parseInt(req.query.min_score);
    if (!isNaN(minScore)) {
      query.andWhere('score >= :minScore', { minScore });
      isFiltered = true;
    }
    let maxScore = parseInt(req.query.max_score);
    if (!isNaN(maxScore)) {
      query.andWhere('score <= :maxScore', { maxScore });
      isFiltered = true;
    }

    // 语言筛选
    if (req.query.language) {
      if (req.query.language === 'submit-answer') {
        query.andWhere(new TypeORM.Brackets(qb => {
          qb.orWhere('language = :language', { language: '' })
            .orWhere('language IS NULL');
        }));
        isFiltered = true;
      } else if (req.query.language === 'non-submit-answer') {
        query.andWhere('language != :language', { language: '' })
             .andWhere('language IS NOT NULL');
        isFiltered = true;
      } else {
        query.andWhere('language = :language', { language: req.query.language });
        isFiltered = true;
      }
    }

    // 状态筛选
    if (req.query.status) {
      query.andWhere('status = :status', { status: req.query.status });
      isFiltered = true;
    }

    // 题目权限和筛选
    if (!inContest && (!curUser || !await curUser.hasPrivilege('manage_problem'))) {
      if (req.query.problem_id) {
        const problem_id = parseInt(req.query.problem_id);
        const problem = await Problem.findById(problem_id);
        if (!problem) {
          return res.send({
            success: false,
            message: '无此题目。'
          });
        }
        if (await problem.isAllowedUseBy(res.locals.user)) {
          query.andWhere('problem_id = :problem_id', { problem_id });
          isFiltered = true;
        } else {
          return res.send({
            success: false,
            message: '您没有权限进行此操作。'
          });
        }
      } else {
        query.andWhere('is_public = true');
      }
    } else if (req.query.problem_id) {
      query.andWhere('problem_id = :problem_id', { problem_id: parseInt(req.query.problem_id) });
      isFiltered = true;
    }

    // 排序
    query.orderBy('id', 'DESC');

    // 分页
    const paginate = syzoj.utils.paginate(await JudgeState.countForPagination(query), page, syzoj.config.page.judge_state);
    const judgeStates = await JudgeState.queryPage(paginate, query);

    // 处理提交数据
    const items = [];
    for (const judgeState of judgeStates) {
      await judgeState.loadRelationships();
      
      const state = judgeState;
      const info = await getSubmissionInfo(state, await state.hasPrivilege(curUser, 'manage'));
      const roughResult = getRoughResult(info, curUser);
      
      items.push({
        id: state.id,
        problem: {
          id: state.problem.id,
          title: state.problem.title,
          url: syzoj.utils.makeUrl(['problem', state.problem.id])
        },
        user: {
          id: state.user.id,
          username: state.user.username,
          url: syzoj.utils.makeUrl(['user', state.user.id])
        },
        status: state.status,
        score: state.score,
        total_time: state.total_time,
        max_memory: state.max_memory,
        language: state.language,
        code_length: state.code_length,
        submit_time: state.submit_time,
        formatted_submit_time: syzoj.utils.formatDate(state.submit_time),
        running: state.running,
        result: roughResult,
        token: info.token,
        url: syzoj.utils.makeUrl(['submission', state.id])
      });
    }

    // 显示配置
    const displayConfig = {
      showScore: true,
      showUsage: true,
      showCode: true,
      showResult: true,
      showOthers: !inContest || (contest && contest.ended),
      showTestdata: true,
      showDetailResult: true,
      inContest: inContest,
      showRejudge: false
    };

    res.send({
      success: true,
      data: {
        submissions: items,
        displayConfig: displayConfig,
        pagination: paginate,
        contest: contest ? {
          id: contest.id,
          title: contest.title,
          ended: contest.ended
        } : null,
        isFiltered: isFiltered
      }
    });
  } catch (e) {
    syzoj.log(e);
    res.send({
      success: false,
      message: '获取提交记录失败',
      error: e.message
    });
  }
});

// 获取提交详情
app.get('/api/v2/submissions/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const judgeState = await JudgeState.findById(id);
    
    if (!judgeState) {
      return res.send({
        success: false,
        message: '无此提交。'
      });
    }

    await judgeState.loadRelationships();

    const curUser = res.locals.user;
    const hasPermission = await judgeState.hasPrivilege(curUser, 'manage');
    
    if (!await judgeState.isAllowedVisitBy(curUser)) {
      return res.send({
        success: false,
        message: '您没有权限查看此提交。'
      });
    }

    const info = await getSubmissionInfo(judgeState, hasPermission);
    const roughResult = getRoughResult(info, curUser);
    const overallResult = processOverallResult(info.result, curUser);

    // 获取代码（如果有权限）
    let code = null;
    if (info.allowedSeeCode) {
      if (judgeState.language) {
        code = {
          content: judgeState.code,
          language: judgeState.language,
          formatted: false
        };
        
        // 尝试获取格式化的代码
        const formattedCode = await FormattedCode.findOne({
          where: { judge_id: judgeState.id }
        });
        if (formattedCode) {
          code.formatted_content = formattedCode.code;
          code.formatted = true;
        }
      } else {
        // 答案提交类型
        code = {
          content: judgeState.code,
          language: 'answer',
          formatted: false
        };
      }
    }

    res.send({
      success: true,
      data: {
        submission: {
          id: judgeState.id,
          problem: {
            id: judgeState.problem.id,
            title: judgeState.problem.title,
            url: syzoj.utils.makeUrl(['problem', judgeState.problem.id])
          },
          user: {
            id: judgeState.user.id,
            username: judgeState.user.username,
            url: syzoj.utils.makeUrl(['user', judgeState.user.id])
          },
          status: judgeState.status,
          score: judgeState.score,
          total_time: judgeState.total_time,
          max_memory: judgeState.max_memory,
          language: judgeState.language,
          code_length: judgeState.code_length,
          submit_time: judgeState.submit_time,
          formatted_submit_time: syzoj.utils.formatDate(judgeState.submit_time),
          running: judgeState.running,
          is_public: judgeState.is_public,
          type: judgeState.type,
          type_info: judgeState.type_info
        },
        code: code,
        result: overallResult,
        roughResult: roughResult,
        info: info,
        permissions: {
          allowedSeeCode: info.allowedSeeCode,
          allowedSeeData: info.allowedSeeData,
          allowedSeeDetail: info.allowedSeeDetail,
          allowedRejudge: info.allowedRejudge
        }
      }
    });
  } catch (e) {
    syzoj.log(e);
    res.send({
      success: false,
      message: '获取提交详情失败',
      error: e.message
    });
  }
});

// 获取提交的显示配置
app.get('/api/v2/submissions/config', async (req, res) => {
  try {
    const contest_id = req.query.contest_id;
    let inContest = false;
    let contest = null;

    if (contest_id) {
      contest = await Contest.findById(contest_id);
      if (contest) {
        inContest = true;
      }
    }

    const displayConfig = {
      showScore: true,
      showUsage: true,
      showCode: true,
      showResult: true,
      showOthers: !inContest || (contest && contest.isEnded()),
      showTestdata: true,
      showDetailResult: true,
      inContest: inContest,
      showRejudge: false
    };

    res.send({
      success: true,
      data: {
        displayConfig: displayConfig,
        contest: contest ? {
          id: contest.id,
          title: contest.title,
          ended: contest.isEnded()
        } : null
      }
    });
  } catch (e) {
    syzoj.log(e);
    res.send({
      success: false,
      message: '获取显示配置失败',
      error: e.message
    });
  }
});
