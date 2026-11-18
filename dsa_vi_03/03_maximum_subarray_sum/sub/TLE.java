

class Solution {
    int maxSubarraySum(int[] arr) {
        // Your code here
        int max = -1000000000;
        int highest = arr[0];
        int sum = 0;
        for(int i = 0; i<arr.length; i++){
            sum = 0;
            for(int j = i; j<arr.length; j++){
                sum+=arr[j];
                if(max<sum){
                    max = sum;
                }
            }
            if(arr[i]>highest){
                highest = arr[i];
            }
        }
        if(max <= highest || max > 1000000000 ){
            return highest;
        }else{
            return max;
        }
    }
}