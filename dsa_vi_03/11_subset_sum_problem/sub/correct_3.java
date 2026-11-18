

// User function Template for Java

class Solution {

    static Boolean isSubsetSum(int arr[], int target) {
        // code here
        int n = arr.length;
        boolean dp[][] = new boolean[n][target+1];
        // for(int i = 0;i<dp.length;i++) {
        //     for(int j = 0; j< dp[i].length; j++) {
        //         dp[i][j] = -1;
        //     }
        // }
        
        // base case
        for(int ind = 0; ind < n;ind++) {
            dp[ind][0] = true;
        }
        
        if(arr[0] <= target) dp[0][arr[0]] = true;
        
        // memo
        for(int ind = 1; ind < n; ind ++) {
            for(int tar = 1; tar <= target; tar++) {
                boolean notTake = dp[ind - 1][tar];
                boolean take = false;
                if(tar >= arr[ind]) {
                    take = dp[ind - 1][tar - arr[ind]];
                }
    
                dp[ind][tar] = (notTake || take);
            }
        }
        
        return dp[n-1][target];
        
        
        // return isSubsetSumRec(arr, n - 1, target, dp);
    }
    
    private static Boolean isSubsetSumRec(int arr[], int ind, int target, int dp[][]) {
        if(target == 0) {
            return true;
        }
        if(ind == 0) {
            return arr[0] == target;
        }
        
        if(dp[ind][target] != -1) {
            return dp[ind][target] == 1;
        }
        
        boolean notTake = isSubsetSumRec(arr, ind - 1, target, dp);
        boolean take = false;
        if(target >= arr[ind]) {
            take = isSubsetSumRec(arr, ind - 1, target - arr[ind], dp);
        }
        dp[ind][target] = (notTake || take) ? 1 : 0;
        return notTake || take;
    }
}