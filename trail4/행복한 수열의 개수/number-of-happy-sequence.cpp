#include <iostream>
#include <algorithm>

using namespace std;

#define MAX_N 100

int n, m;
int grid[MAX_N][MAX_N];
int seq[MAX_N];

bool isHappySeq() {
    int conseq = 1;
    int max_conseq = 1;
    for (int i = 1;i <= n;i++) {
        if (seq[i-1] == seq[i])
            conseq++;
        else conseq = 1;

        max_conseq = max(conseq, max_conseq);
    }
    
    return max_conseq >= m;
}

int main() {

    int total = 0;

    cin >> n >> m;
    for (int i = 0;i < n;i++) {
        for (int j = 0;j < n;j++) {
            cin >> grid[i][j];
        }
    }

    //가로
    for (int i = 0;i < n;i++) {
        for (int j = 0;j < n;j++) {
            seq[j]=grid[i][j];
            

        }
        if (isHappySeq())total++;
    }
    //세로
    for (int j = 0;j < n;j++) {
        for (int i = 0;i < n;i++) {
            seq[i] = grid[i][j];
        }
        if (isHappySeq())total++;
    }
    cout << total;
    return 0;
}