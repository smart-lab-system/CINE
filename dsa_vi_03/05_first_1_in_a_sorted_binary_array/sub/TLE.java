// User function Template for Java

class Solution {

    public long firstIndex(int arr[]) {
        int start = 0, end = arr.length-1,pivot=(arr.length-1)/2;
        int first = -1;
        while(start<end) {
            if(arr[pivot]==1) {
                first = pivot;
                pivot = pivot/2;
                end=pivot;
            } else {
                start = pivot;
                pivot = (end+pivot)/2;
            }
        }
        
        return first;
    }
}