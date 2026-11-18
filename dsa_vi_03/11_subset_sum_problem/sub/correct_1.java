

// User function Template for Java

class Solution {

    static Boolean isSubsetSum(int arr[], int target) {
        // code here
        return superset(arr,target);
    }
    static boolean superset(int[] arr,int sum){
        int n= arr.length;
        boolean[][] dp= new boolean[n+1][sum+1];
        for(int i=0;i<=arr.length;i++){
             dp[i][0]=true;
    }
    for(int i=1;i<=n;i++){
        for(int j=1;j<=sum;j++){
            if(arr[i-1]<=j){
                dp[i][j]=dp[i-1][j] || dp[i-1][j-arr[i-1]];
       } else{
             dp[i][j]=dp[i-1][j] ;
        }
    }
        }
    
    return dp[n][sum];
    }
}