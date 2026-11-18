

// User function Template for Java

class Solution {
    public static int longestSubarray(int[] arr, int k) {
        int max=Integer.MIN_VALUE;
         int len=0;
        int currsum=0;
        for(int i=0;i<arr.length;i++){
            int start=i;
            for(int j=i;j<arr.length;j++){
                int end=j;
               currsum=0;
                for(int K=start;K<=end;K++){
                    currsum+=arr[i];
                    if(currsum>max){
                        max=currsum;
                    }
                    if(max==k){
                        len=Math.max(len,j-i+1);
                    }
                }
            }
            
            
        }
        return len;
    }
    public static void main(String[]args){
        int arr[]={4,5,9,6,7};
        int k=18;
        int len=longestSubarray(arr,k);
        System.out.println("length of longest subarray is:"+len);
    }
}