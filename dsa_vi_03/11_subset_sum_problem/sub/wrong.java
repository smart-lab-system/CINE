

// User function Template for Java

class Solution {

    Boolean isSubsetSum(int arr[], int target) {
       // code here
       return isSubset(0, target, arr, new HashMap<Integer,Boolean>());
   }
    private boolean isSubset(int current, int target, int arr[], HashMap<Integer,Boolean> memo){
        if(current >= arr.length-1) return false;
        if(target ==0 ) return true;
       
       if(memo.containsKey(current)){
           return memo.get(current);
       }
       

        if( arr[current] <= target){
       boolean  consider = isSubset(current+1, target- arr[current], arr, memo);
         boolean notConsider = isSubset(current+1, target, arr, memo);
          memo.put(current,consider || notConsider );
           return consider || notConsider;
        }
        else{
        boolean notConsider = isSubset(current+1, target, arr, memo);
        memo.put(current, notConsider );
        return  notConsider;
        }
    }
}