# Predict Arena 测试用例

> 配置参数：房间有效期 5min | 支付超时 90s | 预测时间 60s | 结算等待 30s | 入场费 1 USDC | 平台费率 5%

---

## 一、房间模式 — 正常流程

### TC-R-01 2人房间完整正常流程（Happy Path）

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | A 创建2人房间 | 返回6位邀请码，DB 创建 game(mode=room, state=waiting)，链上 ownerCreateRoom 成功 |
| 2 | B 输入邀请码验证 | 收到 room:valid，显示房间信息 |
| 3 | B 确认加入 | 房间满员，A/B 都收到 room:full，进入支付阶段，90s倒计时开始 |
| 4 | A 支付 | 链上确认支付，A/B 收到 room:payment:update (paidCount=1/2) |
| 5 | B 支付 | 链上确认支付，allPaid=true，游戏开始 |
| 6 | A/B 收到 game:start | 显示 basePrice，进入60s预测阶段 |
| 7 | A 预测 LONG，B 预测 SHORT | 各自收到 game:predicted 确认 |
| 8 | 预测阶段结束 | 进入 settling 阶段，30s倒计时 |
| 9 | 结算 | 根据价格涨跌判定胜负，赢家获得 1.9 USDC，输家获得 0，链上 settleGame，DB 更新 |
| 10 | A/B 收到 game:result | 显示个人结果（胜负、奖励金额） |

### TC-R-02 多人房间（3-5人）完整正常流程

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | A 创建3人房间 | 生成邀请码 |
| 2 | B 加入 | room:update 显示 2/3 |
| 3 | C 加入 | 房间满员，A/B/C 都收到 room:full |
| 4 | A/B/C 依次支付 | 每次支付后广播 paidCount 更新 |
| 5 | 全部支付完成 | 游戏开始 |
| 6 | A LONG, B SHORT, C LONG | 预测阶段正常 |
| 7 | 结算（价格上涨） | A/C 赢，B 输。赢家各得 (0.95 + 0.95/2) = 1.425 USDC，B 输 1 USDC |

---

## 二、房间模式 — 等待阶段（Waiting Phase）

### TC-R-10 房间5分钟过期（无人加入）

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | A 创建2人房间 | 房间创建成功，5min 过期计时器启动 |
| 2 | 等待5分钟，无人加入 | _expire 触发 |
| 3 | - | A 收到 room:expired，链上 cancelGame，DB state=expired，内存房间删除 |

### TC-R-11 房间5分钟过期（有人加入但未满）

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | A 创建3人房间 | 房间创建成功 |
| 2 | B 加入 | room:update 显示 2/3 |
| 3 | 等待5分钟 | _expire 触发 |
| 4 | - | A/B 都收到 room:expired，链上取消，DB state=expired |

### TC-R-12 房主在等待阶段主动解散房间

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | A 创建2人房间 | 房间创建成功 |
| 2 | A 发送 room:dissolve | A 收到 room:dissolved(reason=房主解散了房间)，链上 cancelGame，DB state=cancelled |

### TC-R-13 房主在等待阶段解散房间（已有人加入）

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | A 创建3人房间 | 房间创建成功 |
| 2 | B 加入 | 2/3 |
| 3 | A 发送 room:dissolve | A/B 都收到 room:dissolved，链上取消，DB state=cancelled |

### TC-R-14 非房主不能解散房间

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | A 创建3人房间，B 加入 | 2/3 |
| 2 | B 发送 room:dissolve | 返回错误 "只有房主可以解散" |

### TC-R-15 房主在等待阶段断线

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | A 创建2人房间 | 房间创建成功 |
| 2 | A 断线 | leaveBySocket 检测到 A 是 owner → _dissolve(code, "房主断线")，链上取消，DB state=cancelled |

### TC-R-16 房主在等待阶段断线（已有人加入）

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | A 创建3人房间，B 加入 | 2/3 |
| 2 | A 断线 | B 收到 room:dissolved(reason=房主断线)，链上取消，房间删除 |

### TC-R-17 非房主在等待阶段主动离开

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | A 创建3人房间，B 加入 | 2/3 |
| 2 | B 发送 room:leave | B 从 players 移除，A 收到 room:update 显示 1/3 |
| 3 | 房间继续存在 | 其他用户可以加入，5min 过期计时器继续运行 |

### TC-R-18 非房主在等待阶段断线

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | A 创建3人房间，B 加入 | 2/3 |
| 2 | B 断线 | leaveBySocket 移除 B（B 不是 owner，不触发 dissolve），A 收到 room:update 1/3 |
| 3 | 房间继续存在 | 新玩家可以加入 |

### TC-R-19 非房主离开后新玩家加入

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | A 创建2人房间，B 加入 | 满员 |
| 2 | **注意：此时房间已满** | 进入支付阶段（这个case属于支付阶段，见 TC-R-20 系列） |

---

## 三、房间模式 — 支付阶段（Payment Phase）

### TC-R-20 所有人支付超时（90s内无人支付）

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | A 创建2人房间，B 加入，满员 | 进入支付阶段 |
| 2 | 90秒内 A/B 都不支付 | 支付超时触发 |
| 3 | - | DB state=failed，A/B 收到 room:payment:failed，_dissolve 触发（DB state=cancelled 覆盖 failed），链上 cancelGame |
| **关注点** | DB 状态被写了两次（先 failed 再 cancelled），应只写一次 | |

### TC-R-21 A已支付，B不支付，超时

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 2人房间满员，进入支付 | 90s 倒计时 |
| 2 | A 支付成功 | room:payment:update (paidCount=1/2, allPaid=false) |
| 3 | B 不支付，90秒超时 | DB state=failed → _dissolve → state=cancelled |
| 4 | 链上 cancelGame | 遍历已支付玩家，A 的入场费被退还 |
| **关注点** | A 的资金安全（链上有退款机制） | |

### TC-R-22 A已支付，B不支付并主动离开

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 2人房间满员，进入支付 | 90s 倒计时 |
| 2 | A 支付成功 | paidCount=1/2 |
| 3 | B 发送 room:leave | B 从内存 players 移除，A 收到 room:update |
| 4 | **问题**：A 只收到 room:update（人数变化），不知道支付阶段已无法继续 | A 需要等到90秒超时 |
| 5 | 90秒超时触发 | 解散房间，链上退款给 A |
| **Bug** | 1. 无快速失败机制：B走后应立即取消<br>2. A 无明确通知对手已退出<br>3. B 的 game_players 记录未清理 |

### TC-R-23 A已支付，B断线

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 2人房间满员，A 已支付 | paidCount=1/2 |
| 2 | B 断线 | leaveBySocket 移除 B |
| 3 | 同 TC-R-22 | A 仍需等90秒，链上最终退款 |
| **Bug** | 同 TC-R-22 |

### TC-R-24 房主A已支付，房主A断线

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 2人房间满员，A（房主）已支付 | paidCount=1/2 |
| 2 | A 断线 | leaveBySocket → A 是 owner → _dissolve("房主断线") |
| 3 | - | B 收到 room:dissolved，链上 cancelGame 退款给 A |
| **问题** | 支付超时计时器未被清除（_dissolve 不清理 gameService.roomPayments），可能在房间已删除后仍然触发 |

### TC-R-25 非房主B已支付，房主A未支付，A断线

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 2人房间满员，B 已支付 | paidCount=1/2 |
| 2 | A（房主）断线 | _dissolve("房主断线")，链上 cancelGame 退款给 B |
| **关注点** | B 的资金安全（链上退款） |

### TC-R-26 B退出后，C能否加入？

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 2人房间满员，进入支付 | 5min 计时器已被 clearTimeout |
| 2 | B 离开 | players.length=1，room 仍在内存中 |
| 3 | C 输入邀请码 validate | room:valid（检查通过：players.length < maxPlayers） |
| 4 | C 发送 room:join | joinRoom 成功，房间再次满员，触发第二次 room:full |
| **Bug** | 1. 第一次支付超时计时器仍在运行，可能提前解散<br>2. 5min 房间过期计时器丢失（不会重启）<br>3. B 的 game_players 记录残留，DB 中有3个玩家<br>4. 创建第二个 roomPayment session，旧的没清理 |

### TC-R-27 多人房间（3人），1人不支付超时

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 3人房间满员 | 进入支付 |
| 2 | A/B 支付，C 不支付 | paidCount=2/3 |
| 3 | 90秒超时 | DB state=failed → _dissolve → cancelled，链上 cancelGame，A/B 入场费被退还 |

### TC-R-28 多人房间（3人），2人不支付，1人支付后离开

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 3人房间满员 | 进入支付 |
| 2 | A 支付 | paidCount=1/3 |
| 3 | A 离开（房主） | _dissolve 触发，链上退款给 A |
| 4 | B/C 收到 room:dissolved | |

---

## 四、房间模式 — 预测阶段（Prediction Phase）

### TC-R-30 一方不预测（超时）

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 游戏开始，60s 预测阶段 | |
| 2 | A 预测 LONG，B 不预测 | 60s 后 _endPredict 触发 |
| 3 | 进入结算 | B 的 prediction=null → isCorrect=false → B 判负 |
| 4 | 结算完成 | A 赢（如果方向正确），B 必定输 |
| **关注点** | 不预测 = 自动判负，这是设计预期行为 |

### TC-R-31 双方都不预测

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 60s 预测超时 | A/B 都没有预测 |
| 2 | 结算 | 两人 prediction=null，都 isCorrect=false |
| 3 | - | losers.length=2, winners.length=0 → 全输=全退（每人得 0.95 USDC） |

### TC-R-32 双方预测相同方向且正确

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | A LONG, B LONG | |
| 2 | 价格上涨 | 两人都正确 |
| 3 | 结算 | winners=2, losers=0 → 全赢=全退（每人得 0.95 USDC） |

### TC-R-33 双方预测相同方向但错误

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | A LONG, B LONG | |
| 2 | 价格下跌 | 两人都错误 |
| 3 | 结算 | winners=0, losers=2 → 全输=全退（每人得 0.95 USDC） |

### TC-R-34 价格持平（flat）

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | A LONG, B SHORT | |
| 2 | 结算价格 = 基准价格 | isFlat=true |
| 3 | 结算 | 所有人 isCorrect=true → 全退（每人 0.95 USDC） |

### TC-R-35 预测阶段玩家断线

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 游戏进行中，B 断线 | disconnect 事件触发 |
| 2 | - | leaveBySocket 尝试从 room 移除（但此时 room 可能已被删除） |
| 3 | 预测超时 | B 未预测，视为判负 |
| 4 | 结算 | game:result 发送到 B 的 socketId（但B已断线，收不到） |
| **问题** | 1. 断线玩家无法收到结算结果<br>2. 无重连机制恢复游戏状态<br>3. 断线玩家的奖励可能在链上但无法被通知 |

### TC-R-36 所有人提前预测完成

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | A/B 在5秒内都预测完 | totalPredicted === totalPlayers |
| 2 | - | clearTimeout(predictTimer)，clearInterval(countdownInterval)，立即调用 _endPredict |
| 3 | 进入结算等待 | 不需要等完30秒 |

---

## 五、房间模式 — 结算阶段（Settlement Phase）

### TC-R-40 结算时价格服务不可用

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 进入结算 | priceService.getPrice() 返回 null 或 0 |
| 2 | - | 每个玩家收到 game:error("Settlement price unavailable") |
| **问题** | 游戏卡死：activeGames 中的记录不会被清理，DB state 永远是 active |

### TC-R-41 结算阶段玩家断线

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 进入 settling 等待（30s） | |
| 2 | B 断线 | disconnect 事件触发 |
| 3 | 30s 后结算正常执行 | 结算不依赖玩家在线状态 |
| 4 | game:result 发送到 B 的 socketId | B 收不到，但链上奖励已记录 |
| **关注点** | 结算逻辑正常，但断线玩家无法知道结果 |

### TC-R-42 链上 settleGame 失败

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | _settle 中 contractService.settleGame 抛异常 | |
| 2 | - | 异常未被 catch（_settle 没有 try-catch） |
| **Bug** | _settle 中链上调用失败会导致后续 DB 更新和 game:result 都不执行，游戏卡死 |

---

## 六、随机匹配模式 — 正常流程

### TC-M-01 2人随机匹配正常流程

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | A 选择2人匹配 | 加入队列，A 收到 match:update (1/2) |
| 2 | B 选择2人匹配 | 队列满，_formTeam 触发 |
| 3 | - | DB 创建 game(mode=random, state=matching)，链上 ownerCreateGame + ownerJoinGame |
| 4 | A/B 收到 match:found | 进入支付阶段 |
| 5 | A/B 支付 → 游戏开始 → 预测 → 结算 | 同房间模式 |

---

## 七、随机匹配模式 — 队列阶段

### TC-M-10 匹配超时（15秒无人加入）

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | A 选择2人匹配 | 加入队列，15s 超时计时器启动 |
| 2 | 15秒无人 | _timeout 触发 |
| 3 | - | A 收到 match:failed("匹配超时")，队列清空 |

### TC-M-11 匹配中主动取消

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | A 选择2人匹配 | 排队中 |
| 2 | A 发送 match:cancel | removePlayer 从队列移除 A |
| 3 | 队列剩余玩家收到 match:update | |

### TC-M-12 匹配中断线

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | A 在队列中 | |
| 2 | A 断线 | disconnect → removeBySocket 移除 A |
| 3 | 队列中其他玩家收到 match:update | |

### TC-M-13 匹配成功后一方不支付

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | A/B 匹配成功 | 进入支付阶段 |
| 2 | A 支付，B 不支付 | 90秒超时 |
| 3 | - | DB state=failed，A/B 收到 match:error("Payment timeout") |
| **问题** | 1. 随机匹配支付超时只设了 state=failed，没有调用 _dissolve 或 cancelGame<br>2. A 的链上支付**没有退款机制**（与房间模式不同！） |

### TC-M-14 匹配成功后一方断线

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | A/B 匹配成功 | |
| 2 | B 断线 | disconnect → matchmakingService.removeBySocket（但B已不在队列中）+ roomService.leaveBySocket（但B不在房间中） |
| 3 | 无人处理支付阶段的断线 | 只能等90秒超时 |
| **Bug** | 匹配成功后的断线完全没有处理逻辑 |

---

## 八、跨模式冲突

### TC-X-01 玩家同时在房间中又尝试匹配

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | A 创建房间 | |
| 2 | A 发送 match:join | matchmaking 检查队列中无 A（通过），但不检查 room |
| **Bug** | 房间和匹配之间没有互斥检查，A 可能同时参与两个游戏 |

### TC-X-02 玩家在匹配队列中又尝试创建房间

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | A 加入匹配队列 | |
| 2 | A 发送 room:create | roomService.createRoom 检查 rooms 中无 A（通过），不检查匹配队列 |
| **Bug** | 同上，缺少跨模式互斥 |

### TC-X-03 玩家在一个房间中尝试加入另一个房间

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | A 创建房间1 | |
| 2 | A 尝试 joinRoom 房间2 | 返回错误 "已在其他房间中"（room.js:32 有检查） |
| **结果** | 正常，有互斥检查 |

---

## 九、边界与异常用例

### TC-E-01 加入不存在的房间

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | B 输入不存在的邀请码 validate | room:invalid("Room not found") |

### TC-E-02 加入已满的房间

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 2人房间已满 | |
| 2 | C 尝试 validate | room:invalid("Room is full") |

### TC-E-03 重复加入同一房间

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | B 已在房间中 | |
| 2 | B 再次 validate | room:invalid("Already in this room") |

### TC-E-04 重复预测

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | A 已提交预测 | |
| 2 | A 再次 game:predict | 返回错误 "Already predicted" |

### TC-E-05 预测阶段结束后提交预测

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 已进入 settling 阶段 | |
| 2 | A 发送 game:predict | 返回错误 "Prediction phase ended" |

### TC-E-06 无效预测值

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | A 发送 prediction="hold" | 返回错误 "Invalid prediction" |

### TC-E-07 未连接钱包就操作

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 未发送 auth 事件就操作 | wallet=null |
| 2 | 任何 room/match/game 操作 | 返回 "Connect wallet first" |

### TC-E-08 无效的队伍人数

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | match:join teamSize=1 | queues[1] 不存在，返回 "Invalid team size" |
| 2 | match:join teamSize=6 | 同上 |

### TC-E-09 游戏开始时 BTC 价格不可用

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 全部支付完成，startGame | priceService.getPrice() 返回 null |
| 2 | - | 所有玩家收到 game:error("BTC price unavailable")，游戏未创建 |
| **问题** | DB state 已设为 payment，但游戏未开始，状态不会回退 |

### TC-E-10 链上支付确认重试（5次都失败）

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | A 发送 room:payment:confirm | confirmRoomPayment 轮询链上5次（间隔800ms） |
| 2 | 5次都返回 false | 抛出 "On-chain payment not confirmed" |
| 3 | - | A 收到 room:error |

---

## 十、已发现的 Bug 汇总

| ID | 严重程度 | 描述 | 涉及场景 |
|----|---------|------|---------|
| BUG-01 | **高** | 随机匹配支付超时不调用 cancelGame，已支付用户资金无法退还 | TC-M-13 |
| BUG-02 | **高** | _settle 无 try-catch，链上调用失败导致游戏卡死 | TC-R-42 |
| BUG-03 | **中** | 支付阶段玩家退出无快速失败，对手需等90秒超时 | TC-R-22/23 |
| BUG-04 | **中** | 房间满员后 5min 计时器被清除不恢复，玩家退出后房间可能永久挂起 | TC-R-26 |
| BUG-05 | **中** | 房间/匹配之间无互斥，玩家可同时参与两个游戏 | TC-X-01/02 |
| BUG-06 | **中** | 支付超时回调先写 state=failed 再 _dissolve 写 state=cancelled，重复写 | TC-R-20 |
| BUG-07 | **低** | leaveRoom/leaveBySocket 不清理 game_players DB 记录 | TC-R-22/26 |
| BUG-08 | **低** | _dissolve 不清理 gameService.roomPayments，超时计时器可能在房间删除后仍触发 | TC-R-24 |
| BUG-09 | **低** | 断线玩家无重连机制，无法查看游戏结果 | TC-R-35/41 |
| BUG-10 | **低** | startGame 失败时 DB state 不回退（停留在 payment） | TC-E-09 |
