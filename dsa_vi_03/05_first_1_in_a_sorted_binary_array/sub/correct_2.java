// User function Template for Java

class Solution {

    public long firstIndex(int arr[]) {
        // Your code goes here
        int n = arr.length;
        int low = 0;
        int high = n-1;
        long ans = -1;
        
        while(low<=high){
            int mid = low + (high-low)/2;
            
            if(arr[mid]==1){
                ans = mid;
                high=mid-1;
            }
            if(arr[mid]<1){
                low=mid+1;
            }else{
                high=mid-1;
            }
        }
        return ans;
    }
}