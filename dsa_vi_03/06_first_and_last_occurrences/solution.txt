// User function Template for Java

class Solution {
    ArrayList<Integer> find(int arr[], int x) {
        int low=0;
        int res1=-1;
        int res2=-1;
        int high=arr.length-1;
        while(low<=high){
            int mid=(low+high)/2;
            if(arr[mid]==x){
                res1=mid;
                high=mid-1;
            }
            else if(x<arr[mid]){
                high=mid-1;
            }
            else{
                low=mid+1;
            }
        }
        low=0;
        high=arr.length-1;
        while(low<=high){
            int mid=(low+high)/2;
            if(arr[mid]==x){
                res2=mid;
                low=mid+1;
            }
            else if(x<arr[mid]){
                high=mid-1;
            }
            else{
                low=mid+1;
            }
        }
        ArrayList<Integer> a= new ArrayList<>();
        a.add(res1);
        a.add(res2);
        return a;
    }
}