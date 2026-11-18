// User function Template for Java

class Solution {

    public long firstIndex(int arr[]) {
        // Your code goes here
        int low=0; int high=arr.length-1; int result=-1;
        
        if(low<=high){
            mid=low+(high-low)/2;
        if(arr[mid]==1){
            result=mid;
            high=mid-1;
        }else{
            low=mid+1;
        }
        }
        return result;
    }
}