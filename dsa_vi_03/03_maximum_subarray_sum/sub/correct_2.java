

class Solution {
    int maxSubarraySum(int[] arr) {
        // Your code here
        
        int sum=0,max=Integer.MIN_VALUE,i,j,n=arr.length,mainmax=Integer.MIN_VALUE;
        
        for(i=0;i<n;i++)
        {
            sum=sum+arr[i];
             max=Math.max(sum,max);
            if(sum<0)
            sum=0;
            
           
        }
        return max;
    }
}