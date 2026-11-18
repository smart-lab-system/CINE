// User function Template for Java
class Solution {
    int missingNumber(int arr[]) {
        // code here
        Set<Integer> l = new HashSet<>();
        for(int i:arr) l.add(i);
        for (int i=1;i<=arr.length+1;i++){
            if(!l.contains(i)) return i;
        }
        return -1;
    }
}