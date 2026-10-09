// ============================================================
//  삼성 2026 상반기 오전 1번 - 아기 바다거북의 대모험: 해저 화산 지대
//  풀이 코드 (먼저 3시간 타이머 켜고 직접 풀어보고, 막힌 부분만 보기!)
//
//  vector 없이 전부 일반 배열로 풀었어요.
//  거북이 수, 화산 수가 처음에 정해지고 늘어나지 않아서 배열이 더 간단해요.
//
//  ★ = 템플릿 그대로 (exam_day.cpp, simulation.cpp에 있는 모양)
//  ✎ = 이 문제 규칙에 맞게 쓴 부분
//
//  ※ 입력/제한 칸이 비어 있어서 입력 형식은 예제로 추정했어요
//    첫 줄 N M V (격자 크기, 거북이 수, 화산 수) / 격자 N줄 / 거북이 M줄 "행 열" / 화산 V줄 "행 열 P"
//    예제 1, 2 출력과 똑같이 나오는 것 확인함
// ============================================================
#include <iostream>
#include <cstring>
#include <queue>
#include <utility>
using namespace std;

const int MAX = 105;          // ✎ 제한을 몰라서 넉넉하게 (문제의 N 최대 + 5로 바꾸기)
const int MAXK = 10005;       // ✎ 거북이, 화산 최대 수 (넉넉하게)

// [1] 현재 상태 (자료구조 설계) ==================================
int N, M, V;
int grid[MAX][MAX];           // ★ 0 바다, 1 산호초 (1번 칸부터 사용)
int occ[MAX][MAX];            // ✎ 1 = 살아있는 거북이나 화석이 있는 칸 (이동 장애물)
int heat[MAX][MAX];           // ✎ 이번 턴에 쌓인 열기 (4단계에서 0으로)

// 거북이 k번 정보 (k = 1 ~ M) : vector 대신 배열 여러 개
int tr[MAXK], tc[MAXK];       // 위치
int tState[MAXK];             // 0 = 이동 중, 1 = 안식처 도착, 2 = 화석
int arriveTurn[MAXK];         // 도착한 턴 (못 하면 -1)

// 화산 v번 정보 (v = 1 ~ V)
int vr[MAXK], vc[MAXK];       // 위치
int vP[MAXK];                 // 분출 임계치 P
int vPress[MAXK];             // 현재 마그마 압력
bool vErupt[MAXK];            // 이번 턴에 분출했나

// [2] 방향 + 범위 ==============================================
int dr[4] = { -1, 0, 1, 0 };  // ★ 0 위, 1 오른쪽, 2 아래, 3 왼쪽
int dc[4] = { 0, 1, 0, -1 };
int pri[4] = { 1, 2, 3, 0 };  // ✎ 문제의 우선순위 우 → 하 → 좌 → 상 을 내 방향 번호로

bool inRange(int r, int c) {  // ★
    return 1 <= r && r <= N && 1 <= c && c <= N;
}

// [3] BFS 거리 (안식처에서 거꾸로) ================================
// ★ 핵심 아이디어: "안식처까지의 최단 거리"는 안식처에서 BFS 한 번이면 모든 칸에 대해 구해짐
//   dist[r][c] = (r, c)에서 안식처까지 최소 몇 칸
//   그러면 거북이는 옆 칸 중 dist가 "내 dist - 1"인 칸으로 가면 최단 경로의 첫 칸
int dist[MAX][MAX];

void bfsFromGoal() {
    for (int i = 1; i <= N; i++)                 // ★ 초기화
        for (int j = 1; j <= N; j++)
            dist[i][j] = -1;
    queue< pair<int, int> > q;
    dist[N][N] = 0;                              // ✎ 출발점 = 안식처 (N, N)
    q.push(make_pair(N, N));
    while (!q.empty()) {
        int r = q.front().first;
        int c = q.front().second;
        q.pop();
        for (int d = 0; d < 4; d++) {
            int nr = r + dr[d];
            int nc = c + dc[d];
            if (!inRange(nr, nc)) continue;
            if (grid[nr][nc] == 1) continue;     // ✎ 산호초
            if (occ[nr][nc] == 1) continue;      // ✎ 다른 거북이, 화석
            if (dist[nr][nc] != -1) continue;
            dist[nr][nc] = dist[r][c] + 1;
            q.push(make_pair(nr, nc));
        }
    }
}

// [1단계] 거북이 k번 이동 ========================================
// 번호 순서대로 한 마리씩 + 앞 거북이 결과가 즉시 반영 → 복사본 필요 없음, occ를 바로 수정
void moveTurtle(int k, int turn) {
    int r = tr[k], c = tc[k];
    occ[r][c] = 0;                               // ✎ 움직이는 자기 자신은 장애물에서 빼고 탐색
    bfsFromGoal();

    if (dist[r][c] > 0) {                        // 길이 있으면 (-1이면 길 없음 → 제자리)
        for (int i = 0; i < 4; i++) {            // ✎ 우 하 좌 상 순서로 첫 칸 고르기
            int d = pri[i];
            int nr = r + dr[d];                  // ★ 계산
            int nc = c + dc[d];
            if (!inRange(nr, nc)) continue;      // ★ 검증
            if (dist[nr][nc] == dist[r][c] - 1) {    // 최단 경로로 이어지는 칸
                r = nr;                          // ★ 반영
                c = nc;
                break;                           // 첫 번째 것만
            }
        }
    }
    tr[k] = r;
    tc[k] = c;

    if (r == N && c == N) {                      // ✎ 안식처 도착 → 지도에서 제외
        tState[k] = 1;
        arriveTurn[k] = turn;                    //   occ는 0으로 둠 (자리 비움)
    } else {
        occ[r][c] = 1;                           //   새 자리에 장애물 표시
    }
}

// [3단계] 화산 하나 분출: 열기 전파 ===============================
void eruptOne(int v) {
    int r = vr[v], c = vc[v], P = vP[v];
    heat[r][c] += P;                             // ✎ 화산 칸에 P
    for (int d = 0; d < 4; d++) {                // ✎ 4방향으로 일직선
        int h = P / 2;                           //    한 칸 갈 때마다 절반 (정수 나눗셈 = 내림)
        int nr = r + dr[d];
        int nc = c + dc[d];
        while (inRange(nr, nc) && grid[nr][nc] != 1 && h > 0) {   // 밖, 산호초, 열기 0이면 멈춤
            heat[nr][nc] += h;                   // ✎ 여러 화산의 열기는 합산 (+=)
            h /= 2;
            nr += dr[d];
            nc += dc[d];
        }
    }
}

// [3단계] 분출 + 연쇄 반응 ========================================
// "새로 분출하는 화산이 없을 때까지 반복" → changed 깃발로 while 반복
void eruptAll() {
    for (int v = 1; v <= V; v++) vErupt[v] = false;
    bool changed = true;
    while (changed) {                            // ★ 변화가 없을 때까지 반복하는 모양
        changed = false;
        for (int v = 1; v <= V; v++) {
            if (vErupt[v]) continue;             // 이미 분출한 화산은 패스
            // ✎ 처음엔 heat가 0이라 "압력 >= P"와 같고, 연쇄 때는 외부 열기까지 더해서 비교
            //    외부 열기는 조건 비교에만 쓰고 vPress에는 더하지 않음
            if (vPress[v] + heat[vr[v]][vc[v]] >= vP[v]) {
                vErupt[v] = true;
                eruptOne(v);
                changed = true;                  // 새로 분출했으니 한 바퀴 더 확인
            }
        }
    }
    // 화석화: 모든 분출이 끝난 뒤 살아있는 거북이 칸의 열기 합이 20 이상
    for (int k = 1; k <= M; k++)
        if (tState[k] == 0 && heat[tr[k]][tc[k]] >= 20)
            tState[k] = 2;                       // ✎ 화석 (occ는 1 그대로 → 계속 장애물)
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(NULL);

    cin >> N >> M >> V;
    for (int i = 1; i <= N; i++)
        for (int j = 1; j <= N; j++)
            cin >> grid[i][j];
    for (int k = 1; k <= M; k++) {
        cin >> tr[k] >> tc[k];
        tr[k]++;                                 // ★ 문제 좌표는 0부터 → 1부터로 +1
        tc[k]++;
        tState[k] = 0;
        arriveTurn[k] = -1;
        occ[tr[k]][tc[k]] = 1;
    }
    for (int v = 1; v <= V; v++) {
        cin >> vr[v] >> vc[v] >> vP[v];
        vr[v]++;
        vc[v]++;
        vPress[v] = 0;
    }

    for (int turn = 1; turn <= 100; turn++) {    // ✎ 최대 100턴
        // 1단계: 바다거북 이동 (ID 작은 순서대로)
        for (int k = 1; k <= M; k++)
            if (tState[k] == 0) moveTurtle(k, turn);

        // 2단계: 화산 압력 +10
        for (int v = 1; v <= V; v++) vPress[v] += 10;

        // 3단계: 분출 + 연쇄 + 화석화
        eruptAll();

        // 4단계: 열기 지우기, 분출한 화산 압력 0
        memset(heat, 0, sizeof(heat));
        for (int v = 1; v <= V; v++)
            if (vErupt[v]) vPress[v] = 0;
    }

    for (int k = 1; k <= M; k++)
        cout << arriveTurn[k] << '\n';
    return 0;
}

// 예제 1 입력          출력
//   4 3 2               -1
//   0 0 0 0             7
//   0 1 0 0             4
//   0 0 0 0
//   0 0 0 0
//   0 0
//   0 1
//   2 0
//   3 0 45
//   3 1 30
//
// 예제 2 입력          출력
//   4 2 1               6
//   0 0 0 0             5
//   0 1 1 0
//   0 1 1 0
//   0 0 0 0
//   0 0
//   1 0
//   3 1 20