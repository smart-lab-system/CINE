// User function Template for Java

class Solution {

    public long firstIndex(int arr[]) {
        
        int si=0;
        long ans=-1;
        int ei=arr.length;
        while(si<ei){
            int mid=si+(ei-si)/2;
            if(arr[mid]==1){
                ans=mid;
                ei=mid-1;
            }
            if(arr[mid]<1){
                si=mid+1;
            }
        }
        return ans;
    }
}