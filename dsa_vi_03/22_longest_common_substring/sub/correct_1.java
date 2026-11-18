// User function Template for Java

class Solution {
    int ans = 0;
    
    public int lcs_rec(String s1, String s2, int n, int m) {
        if (n == s1.length() || m == s2.length()) {
            return 0;
        }
        
        int subAns1 = 0;
        if (s1.charAt(n) == s2.charAt(m)) {
            subAns1 = 1 + lcs_rec(s1,s2,n+1,m+1);
        }
        
        int subAns2 = Math.max(lcs_rec(s1,s2,n+1,m), lcs_rec(s1,s2,n,m+1));
        ans = Math.max(ans, Math.max(subAns1, subAns2));
        
        return subAns1;
    }
    
    public int lcs_memo(String s1, String s2, int n, int m, int dp[][]) {
        if (n == s1.length() || m == s2.length()) {
            return 0;
        }
        
        if (dp[n][m] != -1) {
            return dp[n][m];
        }
        
        int subAns1 = 0;
        if (s1.charAt(n) == s2.charAt(m)) {
            subAns1 = 1 + lcs_memo(s1,s2,n+1,m+1,dp);
        } 
        
        int subAns2 = Math.max(lcs_memo(s1,s2,n+1,m,dp), lcs_memo(s1,s2,n,m+1,dp));
        ans = Math.max(ans, Math.max(subAns1, subAns2));
        
        return dp[n][m] = subAns1;
    }
    
    public int lcs_tab(String s1, String s2, int n, int m) {
        // int ans = 0;
        int dp[][] = new int[n+1][m+1];
        
        for(int i=0;i<=n;i++) {
            for(int j=0;j<=m;j++) {
                if (i == 0 || j == 0) {
                    dp[i][j] = 0;
                } else if (s1.charAt(i-1) == s2.charAt(j-1)) {
                    dp[i][j] = 1 + dp[i-1][j-1];
                    ans = Math.max(ans, dp[i][j]);
                } else {
                    dp[i][j] = 0;
                }
            }
        }
        
        return ans;
    }
    
    public int lcs_space(String s1, String s2, int n, int m) {
        int prev[] = new int[m+1];
        int curr[] = new int[m+1];
        
        for(int i=1;i<=n;i++) {
            for(int j=1;j<=m;j++) {
                if (s1.charAt(i-1) == s2.charAt(j-1)) {
                    curr[j] = 1 + prev[j-1];
                    ans = Math.max(ans, curr[j]);
                } else {
                    curr[j] = 0;
                }
            }
            
            prev = (int[])(curr.clone());
        }
        
        return ans;
    }
    
    public int longestCommonSubstr(String s1, String s2) {
        // code here
        int n = s1.length(), m = s2.length();
        // int dp[][] = new int[n+1][m+1];
        
        // for(int i=0;i<=n;i++) {
        //     for(int j=0;j<=m;j++) {
        //         dp[i][j] = -1;
        //     }
        // }
        
        // lcs_rec(s1,s2,0,0);
        // lcs_memo(s1,s2,0,0,dp);
        // lcs_tab(s1,s2,n,m);
        lcs_space(s1,s2,n,m);
        return ans;
    }
}