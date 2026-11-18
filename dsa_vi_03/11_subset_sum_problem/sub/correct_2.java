

// User function Template for Java

class Solution {

    static Boolean isSubsetSum(int arr[], int target) {
        int n = arr.length;
        
        boolean[][] dp = new boolean[n][target+1];
        
        for(boolean[] row : dp){
            Arrays.fill(row,false);
        }
        
        for(int i = 0; i<n; i++){
            dp[i][0] = true;
        }
        
        if(arr[0]<=target){
            dp[0][arr[0]] = true;
        }
        
        for(int i = 1; i<n; i++){
            for(int t = 1; t<=target; t++){
                boolean notTake = dp[i-1][t];
                boolean take = false;
                if(arr[i] <= t){
                    take = dp[i-1][t-arr[i]];
                }
                dp[i][t] = take || notTake;
            }
        }
        return dp[n-1][target];
        
    }
}